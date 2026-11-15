"""The smart saver's work after an item is saved, run in the background (FastAPI BackgroundTasks) with its own session.

1. Keep copies: a tweet's text and pictures, a video (yt-dlp), or the page's picture. A copy the site refuses only sets
   media_error; the item stays saved with its link.
2. Look at it: the user's own AI gets the text plus up to MAX_AI_IMAGES pictures (the post's pictures, or stills
   through the video) and writes the summary, what is in it, tags and search words.

Status lives on the capture (analysis_status): pending while this runs, then done, no_ai (nothing connected) or
failed. A restart in the middle leaves pending rows, which recover() turns into failed so the app offers Try again.
"""

import contextlib
import logging
import threading
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import models as m
from app.config import get_settings
from app.db import get_sessionmaker
from app.services import saver_ai, saver_media, whoop_ai
from app.services.link_preview import _host
from app.services.saver_media import BUCKET, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES, VIDEO_TYPES, Gathered, MediaRefused

log = logging.getLogger(__name__)
MAX_AI_IMAGES = 6
# Downloads and AI calls are slow; two at a time keeps the small server responsive.
_slots = threading.BoundedSemaphore(2)


def recover() -> None:
    """At start-up: anything left half-done by a restart can be tried again from the app."""
    with contextlib.suppress(Exception), get_sessionmaker()() as db:
        db.execute(
            update(m.Capture)
            .where(m.Capture.analysis_status == "pending")
            .values(analysis_status="failed", analysis_error="Stopped when the server restarted. Try again.")
        )
        db.commit()


def attachments(db: Session, capture: m.Capture) -> list[m.Attachment]:
    return list(
        db.scalars(
            select(m.Attachment)
            .where(m.Attachment.user_id == capture.user_id, m.Attachment.capture_id == capture.id, m.Attachment.bucket == BUCKET)
            .order_by(m.Attachment.created_at, m.Attachment.filename)
        )
    )


def _attach(db: Session, capture: m.Capture, path: Path, content_type: str) -> m.Attachment:
    row = m.Attachment(
        user_id=capture.user_id,
        capture_id=capture.id,
        bucket=BUCKET,
        object_path=saver_media.object_path(capture.user_id, capture.id, path.name),
        filename=path.name,
        content_type=content_type,
        size_bytes=path.stat().st_size,
    )
    db.add(row)
    db.flush()
    return row


def _keep_images(db: Session, capture: m.Capture, folder: Path, urls: list[str], prefix: str) -> None:
    for index, url in enumerate(dict.fromkeys(urls)):
        if index >= MAX_IMAGES:
            break
        temp = folder / f"{prefix}-{index}.download"
        try:
            kind = saver_media.download(url, temp, MAX_IMAGE_BYTES)
        except MediaRefused:
            continue
        final = temp.with_suffix("." + IMAGE_TYPES.get(kind, "jpg"))
        temp.rename(final)
        _attach(db, capture, final, kind if kind in IMAGE_TYPES else "image/jpeg")


def _gather_link(db: Session, capture: m.Capture, folder: Path) -> None:
    """Copies for a saved link. Never raises for what the site does; sets media_error instead."""
    settings = get_settings()
    max_bytes = settings.saver_max_video_mb * 1024 * 1024
    max_seconds = settings.saver_max_video_minutes * 60
    url = capture.url or ""
    found: Gathered | None = saver_media.read_tweet(url)
    problem: str | None = None
    video: Path | None = None
    if found and found.video_url:
        if found.duration and found.duration > max_seconds:
            problem = "The video is longer than Orbit keeps."
        else:
            try:
                kind = saver_media.download(found.video_url, folder / "video.download", max_bytes, ("video/",))
                video = (folder / "video.download").rename(folder / f"video.{VIDEO_TYPES.get(kind, 'mp4')}")
            except MediaRefused as exc:
                problem = str(exc)
    if found is None and saver_media.ytdlp_supported(url):
        try:
            found = saver_media.ytdlp_download(url, folder, max_bytes, max_seconds)
            video = found.video_file
        except MediaRefused as exc:
            problem = str(exc)
        except Exception:  # A downloader bug must not lose the item.
            log.exception("saver: video download failed")
            problem = "The site didn't let Orbit keep a copy of the video."
    found = found or Gathered()
    if found.text and not capture.content_text:
        capture.content_text = found.text[:8000]
    if found.author and not capture.author:
        capture.author = found.author[:200]
    if found.title and (not capture.title or capture.title.startswith(_host(url))):
        capture.title = found.title[:280]
    if video is not None:
        _attach(db, capture, video, _video_type(video))
    image_urls = found.image_urls or ([capture.image_url] if capture.image_url else [])
    _keep_images(db, capture, folder, image_urls, "poster" if video is not None else "image")
    if video is not None and not any(row.content_type and row.content_type.startswith("image/") for row in attachments(db, capture)):
        poster = folder / "poster.jpg"
        if saver_media.poster_from(video, poster):
            _attach(db, capture, poster, "image/jpeg")
    capture.media_error = problem[:500] if problem else None
    if capture.type == "link" and video is not None and capture.category == "other":
        capture.category = "video"


def _video_type(path: Path) -> str:
    by_suffix = {suffix: kind for kind, suffix in VIDEO_TYPES.items()}
    return by_suffix.get(path.suffix.lstrip(".").lower(), "video/mp4")


def _pictures(rows: list[m.Attachment]) -> list[saver_ai.Image]:
    images: list[saver_ai.Image] = []
    for row in rows:
        path = saver_media.file_for(row.object_path)
        if path is None or not row.content_type:
            continue
        if row.content_type.startswith("video/"):
            images.extend((still, "image/jpeg") for still in saver_media.frames(path))
        elif row.content_type.startswith("image/"):
            ready = saver_media.for_ai(path, row.content_type)
            if ready:
                images.append(ready)
        if len(images) >= MAX_AI_IMAGES:
            break
    return images[:MAX_AI_IMAGES]


def _known(capture: m.Capture) -> dict[str, Any]:
    known = {
        "link": capture.url,
        "site": capture.site_name or capture.source,
        "kind": capture.type,
        "title": capture.title,
        "author": capture.author,
        "text": capture.content_text,
        "description": capture.summary,
        "note": capture.note,
        "media_problem": capture.media_error,
    }
    return {key: value for key, value in known.items() if value}


def _apply(capture: m.Capture, found: saver_ai.Analysis) -> None:
    keeps_title = capture.type == "link" and capture.title and not capture.title.startswith(_host(capture.url or "") or "\0")
    if found.title and not keeps_title:
        capture.title = found.title[:280]
    capture.summary = found.summary[:1000] or capture.summary
    capture.analysis = found.analysis[:4000] or None
    # Tags the user already has stay; the AI's are added after them.
    capture.labels = saver_ai._clean_list([*capture.labels, *found.labels], 20, 40)
    capture.search_terms = " · ".join(found.search_terms)[:4000] or None
    if capture.category == "other" and found.category != "other":
        capture.category = found.category


def process(capture_id: uuid.UUID, locale: str = "en", ai: str | None = None, fetch: bool = True) -> None:
    """The whole background job for one capture. Never raises."""
    with _slots, get_sessionmaker()() as db:
        capture = db.get(m.Capture, capture_id)
        if capture is None:
            return
        try:
            folder = saver_media.folder_for(capture.user_id, capture.id)
            folder.mkdir(parents=True, exist_ok=True)
            if fetch and capture.type == "link" and capture.url and not attachments(db, capture):
                _gather_link(db, capture, folder)
                db.commit()
            access = whoop_ai.access_for(db, capture.user_id, ai, "saver")
            if access is None:
                capture.analysis_status, capture.analysis_error = "no_ai", None
                db.commit()
                return
            found = saver_ai.analyze(access, _known(capture), _pictures(attachments(db, capture)), locale)
            _apply(capture, found)
            capture.analysis_status, capture.analysis_error = "done", None
            db.commit()
        except whoop_ai.InsightUnavailable as exc:
            db.rollback()
            _failed(db, capture_id, str(exc))
        except Exception:
            log.exception("saver: processing failed")
            db.rollback()
            _failed(db, capture_id, "Something went wrong while reading it. Try again.")


def _failed(db: Session, capture_id: uuid.UUID, message: str) -> None:
    capture = db.get(m.Capture, capture_id)
    if capture is not None:
        capture.analysis_status, capture.analysis_error = "failed", message[:500]
        db.commit()
