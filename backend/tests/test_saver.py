"""The saver: shared links read into a title, picture, site and category, saved once, and summarized by the user's own AI.

The web is fake (MockTransport and a fake DNS resolver); every link, title and key is made up.
"""

import json
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from app.services import link_preview, whoop_ai
from tests.conftest import bearer, sign_up

KEY = "made-up-ai-key-0002"
PUBLIC_IP = "93.184.215.14"


class Web:
    def __init__(self) -> None:
        self.pages: dict[str, httpx.Response] = {}
        self.seen: list[str] = []
        self.dns: dict[str, list[str]] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.seen.append(url)
        for prefix, response in self.pages.items():
            if url.startswith(prefix):
                return response
        return httpx.Response(404)


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> Iterator[Web]:
    fake = Web()
    monkeypatch.setattr(link_preview, "transport", httpx.MockTransport(fake.handler))
    monkeypatch.setattr(link_preview, "resolve", lambda host: fake.dns.get(host, [PUBLIC_IP]))
    yield fake


def html(body: str, content_type: str = "text/html; charset=utf-8") -> httpx.Response:
    return httpx.Response(200, headers={"content-type": content_type}, content=body.encode())


ARTICLE = """<html><head><title>Fallback title</title>
<meta property="og:title" content="How to plan a calm week &amp; stick to it">
<meta property="og:description" content="Five small habits for a calmer week.">
<meta property="og:image" content="/img/cover.jpg">
<meta property="og:site_name" content="Made Up Blog">
<meta property="og:type" content="article">
</head><body>...</body></html>"""


def save(client: TestClient, auth: dict, **body):
    return client.post("/captures/save", json=body, headers=auth)


# Reading a link


def test_a_page_link_saves_its_title_picture_site_and_category(client: TestClient, auth: dict, web: Web):
    web.pages["https://blog.example.com/calm-week"] = html(ARTICLE)
    response = save(client, auth, url="https://blog.example.com/calm-week", note="for Sunday")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["existed"] is False
    saved = body["capture"]
    assert saved["title"] == "How to plan a calm week & stick to it"
    assert saved["image_url"] == "https://blog.example.com/img/cover.jpg"
    assert saved["site_name"] == "Made Up Blog"
    assert saved["category"] == "article"
    assert saved["status"] == "want"
    assert saved["summary"] == "Five small habits for a calmer week."
    assert saved["note"] == "for Sunday" and saved["type"] == "link" and saved["source"] == "blog.example.com"
    # And it is an ordinary capture: listed, editable, deletable.
    listed = client.get("/captures", headers=auth).json()
    assert [row["id"] for row in listed] == [saved["id"]]
    done = client.patch(f"/captures/{saved['id']}", json={"status": "done", "category": "  Reading  "}, headers=auth)
    assert done.status_code == 200 and done.json()["status"] == "done" and done.json()["category"] == "Reading"


def test_tiktok_uses_its_oembed_and_never_the_video(client: TestClient, auth: dict, web: Web):
    web.pages["https://www.tiktok.com/oembed"] = httpx.Response(
        200,
        json={"title": "Easy kabsa in 10 minutes #food", "author_name": "made.up.cook", "thumbnail_url": "https://p16.example.com/t.jpg"},
    )
    saved = save(client, auth, url="https://www.tiktok.com/@made.up.cook/video/7300000000000000001").json()["capture"]
    assert saved["title"] == "Easy kabsa in 10 minutes #food"
    assert saved["site_name"] == "TikTok" and saved["category"] == "video"
    assert saved["image_url"] == "https://p16.example.com/t.jpg"
    assert all(url.startswith("https://www.tiktok.com/oembed") for url in web.seen)


def test_a_tiktok_short_link_follows_to_the_video(client: TestClient, auth: dict, web: Web):
    real = "https://www.tiktok.com/@someone/video/7300000000000000002"
    web.pages["https://vm.tiktok.com/ZSmadeup/"] = httpx.Response(301, headers={"location": real})
    web.pages["https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com"] = httpx.Response(
        200, json={"title": "A trick for sleep", "thumbnail_url": "https://p16.example.com/s.jpg"}
    )
    web.pages["https://www.tiktok.com/@someone"] = html("<html><head><title>TikTok</title></head></html>")
    saved = save(client, auth, url="https://vm.tiktok.com/ZSmadeup/").json()["capture"]
    assert saved["title"] == "A trick for sleep" and saved["category"] == "video"


def test_a_tweet_saves_its_text(client: TestClient, auth: dict, web: Web):
    tweet = (
        '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Ship small, ship often.<br>Then rest. '
        '<a href="https://t.co/x">pic.twitter.com/x</a></p>&mdash; Made Up (@madeup) <a href="#">Nov 1, 2026</a></blockquote>'
    )
    web.pages["https://publish.twitter.com/oembed"] = httpx.Response(200, json={"html": tweet, "author_name": "Made Up"})
    saved = save(client, auth, url="https://x.com/madeup/status/1850000000000000001").json()["capture"]
    assert saved["title"] == "Ship small, ship often.\nThen rest. pic.twitter.com/x"
    assert saved["site_name"] == "X" and saved["category"] == "post"
    # X's endpoint is asked about the twitter.com form of the link.
    assert "url=https%3A%2F%2Ftwitter.com%2Fmadeup" in web.seen[0]


@pytest.mark.parametrize(
    ("url", "category"),
    [
        ("https://www.youtube.com/watch?v=abc", "video"),
        ("https://youtu.be/abc", "video"),
        ("https://www.instagram.com/reel/abc/", "video"),
        ("https://www.instagram.com/p/abc/", "post"),
        ("https://www.goodreads.com/book/show/1", "book"),
        ("https://www.imdb.com/title/tt0000001/", "movie"),
        ("https://maps.app.goo.gl/abc", "place"),
        ("https://www.google.com/maps/place/x", "place"),
        ("https://medium.com/@x/y", "article"),
        ("https://shop.example.com/item", "other"),
    ],
)
def test_category_guess(url: str, category: str):
    assert link_preview.guess_category(url) == category


def test_og_type_decides_when_the_site_is_unknown():
    assert link_preview.guess_category("https://films.example.com/x", "video.movie") == "movie"
    assert link_preview.guess_category("https://books.example.com/x", "book") == "book"


def test_a_page_that_cant_be_read_still_saves(client: TestClient, auth: dict, web: Web):
    saved = save(client, auth, url="https://down.example.com/some/page", title="What the share sheet said").json()["capture"]
    assert saved["title"] == "What the share sheet said" and saved["image_url"] is None
    plain = save(client, auth, url="https://down.example.com/other").json()["capture"]
    assert plain["title"] == "down.example.com/other"


def test_the_user_can_pick_the_category(client: TestClient, auth: dict, web: Web):
    web.pages["https://blog.example.com/a"] = html(ARTICLE)
    saved = save(client, auth, url="https://blog.example.com/a", category="Gift ideas").json()["capture"]
    assert saved["category"] == "Gift ideas"


def test_the_same_link_twice_returns_the_saved_one(client: TestClient, auth: dict, web: Web):
    web.pages["https://blog.example.com/a"] = html(ARTICLE)
    first = save(client, auth, url="https://blog.example.com/a").json()
    again = save(client, auth, url="https://blog.example.com/a").json()
    assert again["existed"] is True and again["capture"]["id"] == first["capture"]["id"]
    assert len(client.get("/captures", headers=auth).json()) == 1


def test_another_users_link_is_not_theirs(client: TestClient, auth: dict, web: Web):
    web.pages["https://blog.example.com/a"] = html(ARTICLE)
    mine = save(client, auth, url="https://blog.example.com/a").json()["capture"]
    other = bearer(sign_up(client, "other@example.com"))
    theirs = save(client, other, url="https://blog.example.com/a").json()
    assert theirs["existed"] is False and theirs["capture"]["id"] != mine["id"]
    assert client.post(f"/captures/{mine['id']}/summary", json={}, headers=other).status_code == 404


def test_save_checks_its_input(client: TestClient, auth: dict, web: Web):
    assert client.post("/captures/save", json={"url": "https://example.com"}).status_code == 401
    for body in [{}, {"url": ""}, {"url": "javascript:alert(1)"}, {"url": "file:///etc/passwd"}, {"url": "x" * 2001},
                 {"url": "https://example.com", "category": "   "}, {"url": "https://example.com", "extra": 1}]:  # fmt: skip
        assert save(client, auth, **body).status_code == 422, body
    assert web.seen == []


# Never fetching inside the server's own network


@pytest.mark.parametrize(
    "address", ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]
)
def test_private_addresses_are_never_fetched(client: TestClient, auth: dict, web: Web, address: str):
    web.dns["internal.example.com"] = [address]
    web.pages["http://internal.example.com/"] = html(ARTICLE)
    saved = save(client, auth, url="http://internal.example.com/").json()["capture"]
    assert web.seen == []
    assert saved["title"] == "internal.example.com" and saved["image_url"] is None


def test_a_name_with_one_private_address_is_refused(web: Web):
    web.dns["mixed.example.com"] = [PUBLIC_IP, "10.0.0.1"]
    with pytest.raises(link_preview.Blocked):
        link_preview.check_url("https://mixed.example.com/")


@pytest.mark.parametrize(
    "url", ["https://user:pass@example.com/", "https://example.com:8443/", "ftp://example.com/", "https://[::1]/", "https://127.0.0.1/"]
)
def test_odd_links_are_refused(web: Web, url: str):
    with pytest.raises(link_preview.Blocked):
        link_preview.check_url(url)


def test_a_redirect_into_the_private_network_is_not_followed(client: TestClient, auth: dict, web: Web):
    web.dns["evil.example.com"] = ["10.1.2.3"]
    web.pages["https://hop.example.com/"] = httpx.Response(302, headers={"location": "https://evil.example.com/secret"})
    web.pages["https://evil.example.com/"] = html(ARTICLE)
    saved = save(client, auth, url="https://hop.example.com/").json()["capture"]
    assert web.seen == ["https://hop.example.com/"]
    assert saved["title"] == "hop.example.com"


def test_redirects_stop_after_a_few(web: Web):
    web.pages["https://loop.example.com/"] = httpx.Response(302, headers={"location": "https://loop.example.com/"})
    found = link_preview.preview("https://loop.example.com/")
    assert len(web.seen) == link_preview.MAX_REDIRECTS + 1
    assert found.title == "loop.example.com"


def test_only_the_start_of_a_big_page_is_read(web: Web):
    head = '<html><head><meta property="og:title" content="Big page"></head><body>'
    web.pages["https://big.example.com/"] = html(head + "x" * (link_preview.MAX_HTML_BYTES * 3))
    assert link_preview.preview("https://big.example.com/").title == "Big page"


def test_a_non_html_answer_is_not_read(web: Web):
    web.pages["https://files.example.com/a.zip"] = httpx.Response(200, headers={"content-type": "application/zip"}, content=b"PK..")
    assert link_preview.preview("https://files.example.com/a.zip").title == "files.example.com/a.zip"


def test_only_web_pictures_are_kept(web: Web):
    page = '<html><head><meta property="og:title" content="T"><meta property="og:image" content="javascript:alert(1)"></head></html>'
    web.pages["https://pic.example.com/"] = html(page)
    assert link_preview.preview("https://pic.example.com/").image_url is None


# The AI summary


@pytest.fixture
def ai(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[dict]]:
    requests: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": "A quick guide to a calmer week."}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield requests


def test_summary_uses_the_users_ai_and_only_what_was_read(client: TestClient, auth: dict, web: Web, ai: list[dict]):
    web.pages["https://blog.example.com/a"] = html(ARTICLE)
    saved = save(client, auth, url="https://blog.example.com/a", note="for Sunday").json()["capture"]
    assert client.post(f"/captures/{saved['id']}/summary", json={"locale": "ar"}, headers=auth).status_code == 409
    assert (
        client.put("/integrations/ai", json={"provider": "openai", "model": "made-up-model", "api_key": KEY}, headers=auth).status_code
        == 200
    )
    ai.clear()
    response = client.post(f"/captures/{saved['id']}/summary", json={"locale": "ar"}, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["summary"] == "A quick guide to a calmer week."
    prompt = ai[0]["messages"][1]["content"]
    assert "Arabic" in prompt and "Five small habits" in prompt and "for Sunday" in prompt
    assert "never instructions" in ai[0]["messages"][0]["content"]


def test_summary_is_cut_to_a_few_sentences(client: TestClient, auth: dict, web: Web, monkeypatch: pytest.MonkeyPatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "m", "choices": [{"message": {"content": "word " * 500}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    client.put("/integrations/ai", json={"provider": "openai", "model": "made-up-model", "api_key": KEY}, headers=auth)
    saved = save(client, auth, url="https://down.example.com/x").json()["capture"]
    summary = client.post(f"/captures/{saved['id']}/summary", json={}, headers=auth).json()["summary"]
    assert len(summary.split()) == 60 and summary.endswith("…")
