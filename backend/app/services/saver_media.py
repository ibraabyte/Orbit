"""Copies of what is shared into the saver: a tweet's text and pictures, a video, a page's picture, kept on the server's disk.

Files live under settings.media_dir/<user id>/<capture id>/ and are listed in the attachments table (bucket "saver").
The app gets them through short signed links (signed_path / check_signature), so a video player needs no headers.

Where things come from:
- X / Twitter: api.fxtwitter.com, a free public reader of tweets (no key), gives the text, author, pictures and the
  video's file. ponytail: it is a third-party service; if it goes away, X videos still come through yt-dlp.
- Video sites (TikTok, YouTube, Instagram, Snapchat, ...): yt-dlp, the open-source downloader. Sites change and some
  (Instagram most of all) refuse without a signed-in account, so a refused download only sets media_error.
- Anything else: the page's own picture (og:image).
Every plain download goes through link_preview's public-address check on each redirect.
"""

import hashlib
import hmac
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx2 as httpx

from app.config import get_settings
from app.services import link_preview
from app.services.link_preview import Blocked, _host, _matches

BUCKET = "saver"
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGES = 4
LINK_DAYS = 7
IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
}
VIDEO_TYPES = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v", "video/3gpp": "3gp"}

# Sites yt-dlp is asked to fetch a video from. Others never are: it would follow whatever the page points at.
YTDLP_SITES = (
    "tiktok.com",
    "youtube.com",
    "youtu.be",
    "instagram.com",
    "snapchat.com",
    "x.com",
    "twitter.com",
    "vimeo.com",
    "facebook.com",
    "fb.watch",
    "reddit.com",
    "threads.net",
    "twitch.tv",
    "dailymotion.com",
)
TWEET = re.compile(r"^https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/(?:[^/]+|i/web)/status(?:es)?/(\d+)", re.IGNORECASE)


class MediaRefused(Exception):
    """The site didn't give a copy; the message is safe to show in the app."""


@dataclass
class Gathered:
    """What was read about a link beyond its preview."""

    text: str | None = None
    author: str | None = None
    title: str | None = None
    description: str | None = None
    image_urls: list[str] = field(default_factory=list)
    video_url: str | None = None
    # A video yt-dlp already wrote into the folder.
    video_file: Path | None = None
    duration: float | None = None


# Paths and signed links


def root() -> Path:
    return Path(get_settings().media_dir)


def folder_for(user_id: uuid.UUID, capture_id: uuid.UUID) -> Path:
    return root() / str(user_id) / str(capture_id)


def object_path(user_id: uuid.UUID, capture_id: uuid.UUID, name: str) -> str:
    return f"{user_id}/{capture_id}/{name}"


def file_for(path: str) -> Path | None:
    """The file on disk for an attachment's object_path, only if it stays inside the media folder."""
    base = root().resolve()
    target = (base / path).resolve()
    return target if target.is_relative_to(base) and target.is_file() else None


def remove_capture(user_id: uuid.UUID, capture_id: uuid.UUID) -> None:
    shutil.rmtree(folder_for(user_id, capture_id), ignore_errors=True)


def remove_user(user_id: uuid.UUID) -> None:
    shutil.rmtree(root() / str(user_id), ignore_errors=True)


def _key() -> bytes:
    return hashlib.sha256(b"orbit-saver-media:" + get_settings().jwt_secret.encode()).digest()


def _signature(attachment_id: uuid.UUID, expires: int) -> str:
    return hmac.new(_key(), f"{attachment_id}.{expires}".encode(), hashlib.sha256).hexdigest()[:40]


def signed_path(attachment_id: uuid.UUID, now: float | None = None) -> str:
    """A link the app can hand straight to an image or video player. It lasts LINK_DAYS and stays the same through a
    day (the expiry is rounded to midnight UTC), so pictures stay cached."""
    day = 86400
    expires = (int(now if now is not None else time.time()) // day + 1 + LINK_DAYS) * day
    return f"/captures/media/{attachment_id}?exp={expires}&sig={_signature(attachment_id, expires)}"


def check_signature(attachment_id: uuid.UUID, expires: int, signature: str) -> bool:
    return expires > time.time() and hmac.compare_digest(_signature(attachment_id, expires), signature)


# Downloads


def download(url: str, dest: Path, max_bytes: int, kinds: tuple[str, ...] = ("image/",)) -> str:
    """Saves a public file (redirects checked hop by hop) and returns its content type. Raises MediaRefused."""
    try:
        with link_preview._client() as client:
            for _ in range(link_preview.MAX_REDIRECTS + 1):
                link_preview.check_url(url)
                with client.stream("GET", url, headers={"Accept": "*/*"}, timeout=30.0) as response:
                    if response.is_redirect and response.headers.get("location"):
                        url = urljoin(url, response.headers["location"])
                        continue
                    if response.status_code != 200:
                        raise MediaRefused("The site didn't give the file.")
                    kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
                    if not kind.startswith(kinds):
                        raise MediaRefused("That link isn't a picture or video.")
                    if int(response.headers.get("content-length") or 0) > max_bytes:
                        raise MediaRefused("The file is too big to keep a copy.")
                    size = 0
                    with dest.open("wb") as out:
                        for chunk in response.iter_bytes():
                            size += len(chunk)
                            if size > max_bytes:
                                raise MediaRefused("The file is too big to keep a copy.")
                            out.write(chunk)
                    return kind
    except (httpx.HTTPError, Blocked, OSError) as exc:
        dest.unlink(missing_ok=True)
        raise MediaRefused("The site didn't give the file.") from exc
    except MediaRefused:
        dest.unlink(missing_ok=True)
        raise
    raise MediaRefused("The site didn't give the file.")


def tweet_id(url: str) -> str | None:
    match = TWEET.match(url)
    return match.group(1) if match else None


def read_tweet(url: str) -> Gathered | None:
    """A tweet's text, author, pictures and video file, from api.fxtwitter.com. None when it can't be read."""
    status_id = tweet_id(url)
    if status_id is None:
        return None
    try:
        with link_preview._client() as client:
            response = client.get(f"https://api.fxtwitter.com/status/{status_id}", headers={"Accept": "application/json"})
        data = response.json() if response.status_code == 200 else None
    except (httpx.HTTPError, ValueError):
        return None
    tweet = data.get("tweet") if isinstance(data, dict) else None
    if not isinstance(tweet, dict):
        return None
    author = tweet.get("author") if isinstance(tweet.get("author"), dict) else {}
    media = tweet.get("media") if isinstance(tweet.get("media"), dict) else {}
    photos = [photo.get("url") for photo in media.get("photos") or [] if isinstance(photo, dict)]
    videos = [video for video in media.get("videos") or [] if isinstance(video, dict) and video.get("url")]
    found = Gathered(
        text=_text(tweet.get("text"), 8000),
        author=_text(
            " ".join(part for part in (author.get("name"), f"@{author['screen_name']}" if author.get("screen_name") else None) if part), 200
        ),
        image_urls=[url for url in photos if isinstance(url, str)][:MAX_IMAGES],
    )
    if videos:
        found.video_url = videos[0]["url"]
        found.duration = videos[0].get("duration") if isinstance(videos[0].get("duration"), int | float) else None
        if isinstance(videos[0].get("thumbnail_url"), str):
            found.image_urls = [videos[0]["thumbnail_url"], *found.image_urls][:MAX_IMAGES]
    return found


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()[:limit]


def ytdlp_supported(url: str) -> bool:
    return _matches(_host(url), YTDLP_SITES) is not None


def ytdlp_download(url: str, folder: Path, max_bytes: int, max_seconds: int) -> Gathered:
    """The video (into folder/video.<ext>) and what the site says about it. Raises MediaRefused. Replaced in tests."""
    import yt_dlp

    link_preview.check_url(url)

    def too_long(info: dict[str, Any], *, incomplete: bool) -> str | None:
        duration = info.get("duration")
        return "too long" if isinstance(duration, int | float) and duration > max_seconds else None

    options = {
        "outtmpl": str(folder / "video.%(ext)s"),
        # A file that already has sound and picture first (TikTok and X have one); joining two needs ffmpeg.
        "format": "b[ext=mp4][height<=1080]/bv*[height<=1080]+ba/b",
        "merge_output_format": "mp4",
        "max_filesize": max_bytes,
        "noplaylist": True,
        "playlist_items": "1",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 20,
        "match_filter": too_long,
        "retries": 2,
    }
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(url, download=True)
    except Exception as exc:  # yt-dlp raises many kinds; any of them means no copy.
        raise MediaRefused("The site didn't let Orbit keep a copy of the video.") from exc
    if not isinstance(info, dict):
        raise MediaRefused("The site didn't let Orbit keep a copy of the video.")
    if info.get("entries"):
        info = next((entry for entry in info["entries"] if isinstance(entry, dict)), info)
    video = next((path for path in sorted(folder.glob("video.*")) if path.suffix not in (".part", ".ytdl")), None)
    duration = info.get("duration")
    if video is None:
        reason = "The video is longer than Orbit keeps." if isinstance(duration, int | float) and duration > max_seconds else None
        raise MediaRefused(reason or "The video is too big, or the site didn't give it.")
    thumbnail = info.get("thumbnail")
    return Gathered(
        text=_text(info.get("description"), 8000),
        author=_text(info.get("uploader") or info.get("channel"), 200),
        title=_text(info.get("title"), 280),
        image_urls=[thumbnail] if isinstance(thumbnail, str) else [],
        video_file=video,
        duration=duration if isinstance(duration, int | float) else None,
    )


# ffmpeg: pictures from a video, and pictures the AI can read


def has_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(command: list[str], timeout: float = 60) -> bool:
    try:
        return subprocess.run(command, capture_output=True, timeout=timeout, check=False).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def video_seconds(video: Path) -> float | None:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
            capture_output=True,
            timeout=30,
            check=False,
            text=True,
        )
        return float(result.stdout.strip())
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def frames(video: Path, count: int = 4) -> list[bytes]:
    """A few JPEG stills spread through the video, small enough for any AI. Empty without ffmpeg."""
    if not has_ffmpeg():
        return []
    seconds = video_seconds(video) or 0
    moments = [seconds * (index + 0.5) / count for index in range(count)] if seconds > 1 else [0.0]
    stills: list[bytes] = []
    with tempfile.TemporaryDirectory() as work:
        for index, moment in enumerate(moments):
            out = Path(work) / f"{index}.jpg"
            ok = _run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-ss",
                    f"{moment:.2f}",
                    "-i",
                    str(video),
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale='min(1024,iw)':-2",
                    "-q:v",
                    "4",
                    "-y",
                    str(out),
                ]
            )
            if ok and out.is_file():
                stills.append(out.read_bytes())
    return stills


def for_ai(image: Path, content_type: str) -> tuple[bytes, str] | None:
    """A JPEG, PNG, WebP or GIF the AI providers accept, made smaller (and HEIC turned into JPEG) when ffmpeg is here."""
    if has_ffmpeg():
        with tempfile.TemporaryDirectory() as work:
            out = Path(work) / "small.jpg"
            if _run(
                ["ffmpeg", "-v", "error", "-i", str(image), "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", "-y", str(out)]
            ):
                return out.read_bytes(), "image/jpeg"
    if content_type in ("image/jpeg", "image/png", "image/webp", "image/gif") and image.stat().st_size <= 4 * 1024 * 1024:
        return image.read_bytes(), content_type
    return None


# Small enough for every voice model (OpenAI and Groq take up to 25 MB): 10 minutes of 32 kbps mono is about 2.4 MB.
SPEECH_SECONDS = 600


def speech_audio(video: Path) -> bytes | None:
    """The video's sound as a small MP3 for speech to text: mono, 16 kHz, the first SPEECH_SECONDS.
    None without ffmpeg or when the video has no sound."""
    if not has_ffmpeg():
        return None
    with tempfile.TemporaryDirectory() as work:
        out = Path(work) / "speech.mp3"
        command = ["ffmpeg", "-v", "error", "-i", str(video), "-vn", "-t", str(SPEECH_SECONDS)]
        command += ["-ac", "1", "-ar", "16000", "-b:a", "32k", "-y", str(out)]
        # ponytail: under 1 KB is a header with no sound; good enough to skip silent clips' empty files.
        if _run(command, timeout=120) and out.is_file() and out.stat().st_size > 1024:
            return out.read_bytes()
    return None


def poster_from(video: Path, dest: Path) -> bool:
    return (
        has_ffmpeg()
        and _run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", str(video), "-frames:v", "1", "-q:v", "3", "-y", str(dest)])
        and dest.is_file()
    )
