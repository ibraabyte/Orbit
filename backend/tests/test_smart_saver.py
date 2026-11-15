"""The smart saver: copies of tweets, videos and pictures on disk, the user's own AI looking at them, tags, and search by
meaning. The web, the AI and the video downloader are fake; every link, name and key is made up.
"""

import json
import shutil
import subprocess
import uuid
from collections.abc import Iterator
from pathlib import Path

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app import models as m
from app.services import link_preview, saver_jobs, saver_media, whoop_ai
from tests.conftest import bearer, sign_up

KEY = "made-up-ai-key-0003"
PUBLIC_IP = "93.184.215.14"
JPEG = b"\xff\xd8\xff\xe0" + b"made-up-picture" * 20
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"made-up-video" * 50

ANALYSIS = {
    "title": "طبخ كبسة دجاج",
    "summary": "مقطع يشرح طريقة كبسة دجاج سريعة.",
    "analysis": "يطبخ الرز مع الدجاج والبهارات في قدر واحد.",
    "labels": ["طبخ", "#وصفات", "طبخ", "دجاج"],
    "search_terms": ["طبخة", "أكل", "cooking", "recipe", "kabsa"],
    "category": "video",
}


class Web:
    def __init__(self) -> None:
        self.files: dict[str, httpx.Response] = {}
        self.seen: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.seen.append(url)
        for prefix, response in self.files.items():
            if url.startswith(prefix):
                return response
        return httpx.Response(404)


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> Iterator[Web]:
    fake = Web()
    monkeypatch.setattr(link_preview, "transport", httpx.MockTransport(fake.handler))
    monkeypatch.setattr(link_preview, "resolve", lambda host: [PUBLIC_IP])
    yield fake


class Ai:
    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.analysis: dict = dict(ANALYSIS)
        self.terms: list[str] = ["طبخ", "وصفة", "cooking"]
        self.fail = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        if self.fail:
            return httpx.Response(500)
        system = body["messages"][0]["content"]
        content = json.dumps(self.terms if "searching what they saved" in system else self.analysis, ensure_ascii=False)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": content}}]})


@pytest.fixture
def ai(monkeypatch: pytest.MonkeyPatch) -> Iterator[Ai]:
    fake = Ai()
    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(fake.handler))
    yield fake


def connect_ai(client: TestClient, auth: dict) -> None:
    response = client.put("/integrations/ai", json={"provider": "openai", "model": "made-up-model", "api_key": KEY}, headers=auth)
    assert response.status_code == 200, response.text


def picture(content: bytes = JPEG, kind: str = "image/jpeg") -> httpx.Response:
    return httpx.Response(200, headers={"content-type": kind}, content=content)


def page(image: str) -> httpx.Response:
    html = f'<html><head><meta property="og:title" content="Made up page"><meta property="og:image" content="{image}"></head></html>'
    return httpx.Response(200, headers={"content-type": "text/html"}, content=html.encode())


def saved_item(client: TestClient, auth: dict, capture_id: str) -> dict:
    response = client.get(f"/captures/saved/{capture_id}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def images_sent(request: dict) -> list[str]:
    content = request["messages"][1]["content"]
    return (
        [part["image_url"]["url"] for part in content if isinstance(part, dict) and part.get("type") == "image_url"]
        if isinstance(content, list)
        else []
    )


# A link: a copy of its picture, and the AI's look at it


def test_a_saved_link_keeps_a_copy_of_its_picture_and_gets_tags_and_search_words(client: TestClient, auth: dict, web: Web, ai: Ai):
    connect_ai(client, auth)
    web.files["https://blog.example.com/kabsa"] = page("https://img.example.com/kabsa.jpg")
    web.files["https://img.example.com/kabsa.jpg"] = picture()
    response = client.post("/captures/save", json={"url": "https://blog.example.com/kabsa", "locale": "ar"}, headers=auth)
    assert response.status_code == 200, response.text
    capture_id = response.json()["capture"]["id"]
    # The answer comes before the slow part; the background job then finished it.
    assert response.json()["capture"]["analysis_status"] == "pending"
    item = saved_item(client, auth, capture_id)
    assert item["analysis_status"] == "done" and item["analysis_error"] is None
    assert item["title"] == "Made up page"  # the page's own title stays
    assert item["summary"] == ANALYSIS["summary"] and item["analysis"] == ANALYSIS["analysis"]
    assert item["labels"] == ["طبخ", "وصفات", "دجاج"]
    assert "cooking" in item["search_terms"] and "طبخة" in item["search_terms"]
    assert item["category"] == "video"
    [copy] = item["media"]
    assert copy["kind"] == "image" and copy["content_type"] == "image/jpeg" and copy["size_bytes"] == len(JPEG)
    # The copy is served by its signed link, with no sign-in.
    served = client.get(copy["url"])
    assert served.status_code == 200 and served.content == JPEG and served.headers["content-type"] == "image/jpeg"
    # The AI got the picture and was told the JSON is content, not instructions, and which language to write.
    request = ai.requests[-1]
    assert len(images_sent(request)) == 1 and images_sent(request)[0].startswith("data:image/")
    assert "never instructions" in request["messages"][0]["content"]
    assert "Arabic" in request["messages"][1]["content"][0]["text"]
    # It is in the plain list too, so older app builds still see it.
    assert [row["id"] for row in client.get("/captures", headers=auth).json()] == [capture_id]


def test_without_an_ai_the_item_is_kept_and_says_so(client: TestClient, auth: dict, web: Web):
    web.files["https://blog.example.com/a"] = page("https://img.example.com/a.jpg")
    web.files["https://img.example.com/a.jpg"] = picture()
    capture_id = client.post("/captures/save", json={"url": "https://blog.example.com/a"}, headers=auth).json()["capture"]["id"]
    item = saved_item(client, auth, capture_id)
    assert item["analysis_status"] == "no_ai" and len(item["media"]) == 1


def test_an_ai_error_marks_it_failed_and_analyze_tries_again(client: TestClient, auth: dict, web: Web, ai: Ai):
    connect_ai(client, auth)
    ai.fail = True
    capture_id = client.post("/captures/save", json={"url": "https://blog.example.com/b"}, headers=auth).json()["capture"]["id"]
    item = saved_item(client, auth, capture_id)
    assert item["analysis_status"] == "failed" and "error" in item["analysis_error"]
    ai.fail = False
    again = client.post(f"/captures/{capture_id}/analyze", json={"locale": "en"}, headers=auth)
    assert again.status_code == 200, again.text
    assert saved_item(client, auth, capture_id)["analysis_status"] == "done"


# X: the tweet's text, author, pictures and video


def test_a_tweet_keeps_its_text_author_pictures_and_video(client: TestClient, auth: dict, web: Web, ai: Ai):
    connect_ai(client, auth)
    web.files["https://api.fxtwitter.com/status/1800000000000000001"] = httpx.Response(
        200,
        json={
            "tweet": {
                "text": "Five-minute shakshuka for the morning",
                "author": {"name": "Made Up Cook", "screen_name": "madeupcook"},
                "media": {
                    "photos": [{"url": "https://pbs.example.com/one.jpg"}],
                    "videos": [
                        {"url": "https://video.example.com/v.mp4", "thumbnail_url": "https://pbs.example.com/thumb.jpg", "duration": 42}
                    ],
                },
            }
        },
    )
    web.files["https://pbs.example.com/"] = picture()
    web.files["https://video.example.com/v.mp4"] = picture(MP4, "video/mp4")
    url = "https://x.com/madeupcook/status/1800000000000000001?s=20"
    capture_id = client.post("/captures/save", json={"url": url}, headers=auth).json()["capture"]["id"]
    item = saved_item(client, auth, capture_id)
    assert item["content_text"] == "Five-minute shakshuka for the morning"
    assert item["author"] == "Made Up Cook @madeupcook"
    kinds = [(copy["kind"], copy["poster"]) for copy in item["media"]]
    assert ("video", False) in kinds and ("image", True) in kinds and len(kinds) == 3
    video = next(copy for copy in item["media"] if copy["kind"] == "video")
    assert client.get(video["url"]).content == MP4
    # Players ask for parts of a video; the server answers them.
    part = client.get(video["url"], headers={"Range": "bytes=0-9"})
    assert part.status_code == 206 and part.content == MP4[:10]
    assert "shakshuka" in json.dumps(ai.requests[-1], ensure_ascii=False)


def test_a_video_longer_than_the_limit_is_saved_without_a_copy(client: TestClient, auth: dict, web: Web):
    web.files["https://api.fxtwitter.com/status/1800000000000000002"] = httpx.Response(
        200,
        json={"tweet": {"text": "A long talk", "media": {"videos": [{"url": "https://video.example.com/long.mp4", "duration": 99999}]}}},
    )
    capture_id = client.post("/captures/save", json={"url": "https://twitter.com/someone/status/1800000000000000002"}, headers=auth).json()[
        "capture"
    ]["id"]
    item = saved_item(client, auth, capture_id)
    assert item["media"] == [] and item["media_error"] == "The video is longer than Orbit keeps."
    assert not any("long.mp4" in url for url in web.seen)


# Video sites through yt-dlp


def test_a_tiktok_video_is_kept_through_the_downloader(client: TestClient, auth: dict, web: Web, ai: Ai, monkeypatch: pytest.MonkeyPatch):
    connect_ai(client, auth)
    calls: list[str] = []

    def fake_download(url: str, folder: Path, max_bytes: int, max_seconds: int) -> saver_media.Gathered:
        calls.append(url)
        (folder / "video.mp4").write_bytes(MP4)
        return saver_media.Gathered(text="Kabsa in 10 minutes #food", author="made.up.cook", video_file=folder / "video.mp4", duration=30)

    monkeypatch.setattr(saver_media, "ytdlp_download", fake_download)
    url = "https://www.tiktok.com/@made.up.cook/video/7300000000000000009"
    capture_id = client.post("/captures/save", json={"url": url}, headers=auth).json()["capture"]["id"]
    item = saved_item(client, auth, capture_id)
    assert calls == [url]
    assert item["content_text"] == "Kabsa in 10 minutes #food" and item["category"] == "video"
    assert [copy["kind"] for copy in item["media"] if not copy["poster"]] == ["video"]
    assert item["media_error"] is None and item["analysis_status"] == "done"


def test_a_site_that_refuses_the_video_still_saves_the_link(client: TestClient, auth: dict, web: Web):
    capture_id = client.post("/captures/save", json={"url": "https://www.instagram.com/reel/MadeUp123/"}, headers=auth).json()["capture"][
        "id"
    ]
    item = saved_item(client, auth, capture_id)
    assert item["url"] == "https://www.instagram.com/reel/MadeUp123/"
    assert item["media"] == [] and item["media_error"] == "The site didn't let Orbit keep a copy of the video."


def test_other_sites_never_go_to_the_downloader(client: TestClient, auth: dict, web: Web, monkeypatch: pytest.MonkeyPatch):
    def never(*args, **kwargs):
        raise AssertionError("yt-dlp must not run for this site")

    monkeypatch.setattr(saver_media, "ytdlp_download", never)
    client.post("/captures/save", json={"url": "https://blog.example.com/video-post"}, headers=auth)


def test_private_addresses_are_never_downloaded(web: Web, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setattr(link_preview, "resolve", lambda host: ["10.0.0.5"])
    with pytest.raises(saver_media.MediaRefused):
        saver_media.download("https://inside.example.com/secret.jpg", tmp_path / "x", 1000)
    assert web.seen == []


# Shared pictures, videos and text


def test_a_shared_picture_is_kept_and_looked_at(client: TestClient, auth: dict, ai: Ai):
    connect_ai(client, auth)
    response = client.post(
        "/captures/upload",
        files={"file": ("IMG_0001.jpg", JPEG, "image/jpeg")},
        data={"note": "from the market", "locale": "ar"},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    item = saved_item(client, auth, response.json()["id"])
    assert item["type"] == "image" and item["note"] == "from the market"
    assert item["title"] == ANALYSIS["title"] and item["analysis_status"] == "done"
    [copy] = item["media"]
    assert client.get(copy["url"]).content == JPEG
    assert len(images_sent(ai.requests[-1])) == 1


def test_a_shared_video_is_kept(client: TestClient, auth: dict):
    response = client.post("/captures/upload", files={"file": ("clip.mov", MP4, "video/quicktime")}, headers=auth)
    assert response.status_code == 200, response.text
    item = response.json()
    assert item["type"] == "video" and item["category"] == "video"
    assert any(copy["kind"] == "video" and copy["content_type"] == "video/quicktime" for copy in item["media"])


def test_uploads_refuse_other_files_and_ones_too_big(client: TestClient, auth: dict, monkeypatch: pytest.MonkeyPatch):
    assert client.post("/captures/upload", files={"file": ("a.pdf", b"%PDF", "application/pdf")}, headers=auth).status_code == 415
    monkeypatch.setattr(saver_media, "MAX_IMAGE_BYTES", 10)
    big = client.post("/captures/upload", files={"file": ("big.jpg", JPEG, "image/jpeg")}, headers=auth)
    assert big.status_code == 413
    assert client.get("/captures/saved", headers=auth).json() == []
    assert client.post("/captures/upload", files={"file": ("a.jpg", JPEG, "image/jpeg")}).status_code == 401


def test_shared_text_is_kept_as_a_note(client: TestClient, auth: dict, ai: Ai):
    connect_ai(client, auth)
    response = client.post(
        "/captures/text", json={"text": "\nIdea: a weekly family dinner\nwith a new recipe each time", "locale": "en"}, headers=auth
    )
    assert response.status_code == 200, response.text
    item = saved_item(client, auth, response.json()["id"])
    assert item["type"] == "note" and item["content_text"].startswith("Idea")
    assert item["title"] == ANALYSIS["title"] and item["media"] == []


@pytest.mark.skipif(not saver_media.has_ffmpeg(), reason="needs ffmpeg")
def test_a_real_video_gives_the_ai_stills_and_gets_a_poster(client: TestClient, auth: dict, ai: Ai, tmp_path: Path):
    connect_ai(client, auth)
    video = tmp_path / "clip.mp4"
    made = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=duration=4:size=320x240:rate=10", "-pix_fmt", "yuv420p", str(video)],
        capture_output=True,
        check=False,
    )
    assert made.returncode == 0, made.stderr
    response = client.post("/captures/upload", files={"file": ("clip.mp4", video.read_bytes(), "video/mp4")}, headers=auth)
    item = saved_item(client, auth, response.json()["id"])
    assert any(copy["poster"] and copy["kind"] == "image" for copy in item["media"])
    assert len(images_sent(ai.requests[-1])) >= 4


# Tags, search, delete


def test_tags_are_edited_and_kept_when_looked_at_again(client: TestClient, auth: dict, web: Web, ai: Ai):
    connect_ai(client, auth)
    capture_id = client.post("/captures/save", json={"url": "https://blog.example.com/c"}, headers=auth).json()["capture"]["id"]
    edited = client.patch(f"/captures/{capture_id}", json={"labels": ["  عشاء ", "#عشاء", "Dinner"]}, headers=auth)
    assert edited.status_code == 200, edited.text
    assert edited.json()["labels"] == ["عشاء", "Dinner"]
    client.post(f"/captures/{capture_id}/analyze", json={}, headers=auth)
    assert saved_item(client, auth, capture_id)["labels"] == ["عشاء", "Dinner", "طبخ", "وصفات", "دجاج"]
    assert client.patch(f"/captures/{capture_id}", json={"labels": [str(n) for n in range(21)]}, headers=auth).status_code == 422


def test_search_by_meaning_finds_the_cooking_video_without_the_word(client: TestClient, auth: dict, web: Web, ai: Ai):
    assert client.post("/captures/search", json={"query": "مقطع الطبخ"}, headers=auth).status_code == 409
    connect_ai(client, auth)
    cooking = client.post("/captures/save", json={"url": "https://blog.example.com/dinner"}, headers=auth).json()["capture"]["id"]
    ai.analysis = {**ANALYSIS, "title": "Gym", "summary": "Leg day.", "analysis": "Squats.", "labels": ["gym"], "search_terms": ["workout"]}
    gym = client.post("/captures/save", json={"url": "https://blog.example.com/legs"}, headers=auth).json()["capture"]["id"]
    ai.terms = ["طبخه", "وصفة", "cooking"]
    found = client.post("/captures/search", json={"query": "مقطع الطبخ"}, headers=auth)
    assert found.status_code == 200, found.text
    assert found.json()["ids"] == [cooking] and gym not in found.json()["ids"]
    assert found.json()["terms"][0] == "مقطع الطبخ"
    assert "never" in ai.requests[-1]["messages"][0]["content"]


def test_delete_removes_the_copies_from_disk(client: TestClient, auth: dict):
    item = client.post("/captures/upload", files={"file": ("a.jpg", JPEG, "image/jpeg")}, headers=auth).json()
    folder = Path(saver_media.root()) / item["user_id"] / item["id"]
    assert folder.is_dir()
    assert client.delete(f"/captures/{item['id']}", headers=auth).status_code == 204
    assert not folder.exists()
    assert client.get(item["media"][0]["url"]).status_code == 404


def test_signed_links_cant_be_forged_or_reused_after_expiry(client: TestClient, auth: dict):
    item = client.post("/captures/upload", files={"file": ("a.jpg", JPEG, "image/jpeg")}, headers=auth).json()
    url = item["media"][0]["url"]
    assert client.get(url.replace("sig=", "sig=0")).status_code == 403
    copy_id = uuid.UUID(item["media"][0]["id"])
    old = saver_media.signed_path(copy_id, now=0)
    assert client.get(old).status_code == 403
    # Another file's signature doesn't open this one.
    other = saver_media.signed_path(uuid.uuid4()).split("?")[1]
    assert client.get(f"/captures/media/{copy_id}?{other}").status_code == 403


def test_one_user_cant_see_or_touch_anothers_items(client: TestClient, auth: dict):
    item = client.post("/captures/upload", files={"file": ("a.jpg", JPEG, "image/jpeg")}, headers=auth).json()
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get(f"/captures/saved/{item['id']}", headers=other).status_code == 404
    assert client.get("/captures/saved", headers=other).json() == []
    assert client.post(f"/captures/{item['id']}/analyze", json={}, headers=other).status_code == 404
    assert client.delete(f"/captures/{item['id']}", headers=other).status_code == 404
    assert client.get(f"/captures/saved/{item['id']}", headers=auth).status_code == 200


def test_deleting_the_account_removes_its_copies(client: TestClient):
    get_settings_signups(client)
    headers = bearer(sign_up(client, "leaving@example.com"))
    item = client.post("/captures/upload", files={"file": ("a.jpg", JPEG, "image/jpeg")}, headers=headers).json()
    user_folder = Path(saver_media.root()) / item["user_id"]
    assert user_folder.is_dir()
    response = client.post("/auth/delete-account", json={"password": "correct horse battery"}, headers=headers)
    assert response.status_code == 204, response.text
    assert not user_folder.exists()


def get_settings_signups(client: TestClient) -> None:
    from app.config import get_settings

    get_settings().allow_signups = True


def test_a_restart_turns_unfinished_items_into_try_again(client: TestClient, auth: dict, db):
    item = client.post("/captures/text", json={"text": "half done"}, headers=auth).json()
    db.query(m.Capture).filter(m.Capture.id == uuid.UUID(item["id"])).update({"analysis_status": "pending"})
    db.commit()
    saver_jobs.recover()
    db.expire_all()
    row = db.get(m.Capture, uuid.UUID(item["id"]))
    assert row.analysis_status == "failed" and "restarted" in row.analysis_error


def teardown_module() -> None:
    shutil.rmtree(saver_media.root(), ignore_errors=True)
