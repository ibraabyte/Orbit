"""Per-user integrations (Seerr through the server, the overview) and the admin's sign-up switch.

Seerr is a fake (httpx2.MockTransport); every address and key here is made up.
"""

import ipaddress
import json
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import ServiceConnection, User
from app.security import decrypt_secret
from app.services import push, seerr
from tests.conftest import bearer, sign_up

PASSWORD = "correct horse battery"
KEY = "made-up-seerr-key-0001"
PUBLIC = "203.0.113.10"  # documentation range, treated as public by the fake resolver below


@pytest.fixture
def fake_seerr(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []
    addresses = {"seerr.example.com": [PUBLIC], "home.example.com": ["192.168.1.20"], "localhost": ["127.0.0.1"]}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.headers.get("X-Api-Key") != KEY:
            return httpx.Response(401, json={"message": "Unauthorized"})
        path = request.url.path.removeprefix("/api/v1/")
        if path == "auth/me":
            return httpx.Response(200, json={"id": 1, "displayName": "Test Viewer", "permissions": 2})
        if path == "search":
            return httpx.Response(200, json={"results": [{"id": 7, "mediaType": "movie", "title": "Made Up Movie"}]})
        if path == "request" and request.method == "POST":
            return httpx.Response(201, json={"id": 3, "status": 1, "body": json.loads(request.content)})
        if path == "request/3" and request.method == "PUT":
            return httpx.Response(200, json={"id": 3, "status": 1, "body": json.loads(request.content)})
        if path == "request/3" and request.method == "DELETE":
            return httpx.Response(204)
        if path == "movie/404":
            return httpx.Response(404, json={"message": "Movie not found"})
        return httpx.Response(500)

    monkeypatch.setattr(seerr, "transport", httpx.MockTransport(handler))

    def resolve(host: str, port: int) -> list[str]:
        try:
            return [str(ipaddress.ip_address(host))]
        except ValueError:
            return addresses.get(host, [PUBLIC])

    monkeypatch.setattr(seerr, "resolve", resolve)
    # 203.0.113.0/24 is a documentation range; pretend it's on the internet like a real server would be.
    real = seerr._is_public
    monkeypatch.setattr(seerr, "_is_public", lambda address: address == PUBLIC or real(address))
    yield calls


def second_user(client: TestClient) -> dict[str, str]:
    return bearer(sign_up(client, email="other@example.com"))


def test_first_account_is_admin_and_others_are_not(client: TestClient, auth: dict):
    assert client.get("/auth/me", headers=auth).json()["is_admin"] is True
    assert client.get("/auth/me", headers=second_user(client)).json()["is_admin"] is False


def test_admin_opens_and_closes_sign_ups_from_the_app(client: TestClient):
    first = client.post("/auth/sign-up", json={"email": "me@example.com", "password": PASSWORD})
    admin = bearer(first.json())
    assert client.get("/auth/status").json()["signups_open"] is False
    assert client.get("/admin/settings", headers=admin).json() == {"signups_open": False, "signups_forced_by_server": False}

    assert client.patch("/admin/settings", json={"signups_open": True}, headers=admin).json()["signups_open"] is True
    assert client.get("/auth/status").json()["signups_open"] is True
    other = client.post("/auth/sign-up", json={"email": "friend@example.com", "password": PASSWORD})
    assert other.status_code == 201

    # Someone who isn't the admin can't flip it.
    friend = bearer(other.json())
    assert client.get("/admin/settings", headers=friend).status_code == 403
    assert client.patch("/admin/settings", json={"signups_open": False}, headers=friend).status_code == 403

    client.patch("/admin/settings", json={"signups_open": False}, headers=admin)
    assert client.post("/auth/sign-up", json={"email": "late@example.com", "password": PASSWORD}).status_code == 403


def test_env_switch_still_forces_sign_ups_open(client: TestClient, auth: dict):
    get_settings().allow_signups = True
    assert client.get("/admin/settings", headers=auth).json() == {"signups_open": False, "signups_forced_by_server": True}
    assert client.get("/auth/status").json()["signups_open"] is True


def test_overview_starts_empty(client: TestClient, auth: dict):
    body = client.get("/integrations", headers=auth).json()
    assert body["seerr"] == {"connected": False, "url": None, "account_name": None, "connected_at": None, "webhook_path": None}
    assert body["whoop"]["connected"] is False
    assert set(body) == {"whoop", "apple_health", "seerr", "ai", "ais", "chatgpt", "voice", "features"}
    assert body["chatgpt"] == {"status": "not_connected"}
    assert body["ais"] == {"choices": [], "default": None, "server_key": False}


def test_connect_seerr_checks_the_key_and_stores_it_encrypted(client: TestClient, auth: dict, db: Session, fake_seerr):
    bad = client.put("/integrations/seerr", json={"url": "seerr.example.com", "api_key": "wrong-key-123"}, headers=auth)
    assert bad.status_code == 409
    assert "rejected" in bad.json()["detail"]

    response = client.put("/integrations/seerr", json={"url": " seerr.example.com/api/v1/ ", "api_key": KEY}, headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["connected"] is True
    assert body["url"] == "https://seerr.example.com"
    assert body["account_name"] == "Test Viewer"
    assert KEY not in response.text

    row = db.scalar(select(ServiceConnection))
    assert row.api_key != KEY
    assert decrypt_secret(row.api_key) == KEY
    assert KEY not in client.get("/integrations", headers=auth).text
    assert KEY not in client.get("/export", headers=auth).text


def test_proxy_uses_only_this_users_key(client: TestClient, auth: dict, fake_seerr):
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)

    found = client.get("/integrations/seerr/api/search", params={"query": "made up's", "page": 1}, headers=auth)
    assert found.status_code == 200
    assert found.json()["results"][0]["title"] == "Made Up Movie"
    # Seerr refuses reserved characters (+, ', ...) in the raw query, so spaces must go out as %20, not +.
    assert fake_seerr[-1].url.query == b"query=made%20up%27s&page=1"
    assert fake_seerr[-1].headers["X-Api-Key"] == KEY

    made = client.post("/integrations/seerr/api/request", json={"mediaType": "tv", "mediaId": 5, "seasons": "all"}, headers=auth)
    assert made.status_code == 201
    assert made.json()["body"] == {"mediaType": "tv", "mediaId": 5, "seasons": "all"}
    assert client.delete("/integrations/seerr/api/request/3", headers=auth).status_code == 204

    missing = client.get("/integrations/seerr/api/movie/404", headers=auth)
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Seerr: Movie not found"

    # Another account has no Seerr, and can't use the first one's.
    other = second_user(client)
    assert client.get("/integrations/seerr", headers=other).json()["connected"] is False
    assert client.get("/integrations/seerr/api/search", params={"query": "x"}, headers=other).status_code == 404


def test_proxy_refuses_calls_the_app_doesnt_make(client: TestClient, auth: dict, fake_seerr):
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    before = len(fake_seerr)
    for method, path in [("GET", "settings/main"), ("POST", "user"), ("DELETE", "user/1"), ("GET", "../../admin")]:
        assert client.request(method, f"/integrations/seerr/api/{path}", headers=auth).status_code in (404, 405)
    assert len(fake_seerr) == before


def test_proxy_passes_on_the_detail_and_request_calls(client: TestClient, auth: dict, fake_seerr):
    """The richer Movies & TV screens: discover rows, a title's seasons and cast, requests, retry, quota."""
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    for method, path in [
        ("GET", "discover/movies"),
        ("GET", "discover/tv/upcoming"),
        ("GET", "discover/movies/genre/28"),
        ("GET", "genres/tv"),
        ("GET", "movie/7/recommendations"),
        ("GET", "tv/5/similar"),
        ("GET", "movie/7/ratings"),
        ("GET", "tv/5/season/2"),
        ("GET", "person/31"),
        ("GET", "person/31/combined_credits"),
        ("POST", "request/3/retry"),
        ("GET", "user/1/quota"),
        ("GET", "service/radarr"),
        ("GET", "service/sonarr"),
        ("GET", "service/radarr/0"),
        ("GET", "service/sonarr/2"),
    ]:
        before = len(fake_seerr)
        response = client.request(method, f"/integrations/seerr/api/{path}", headers=auth)
        # The fake answers 500 to these; what matters is that the call went out, to the right place.
        assert len(fake_seerr) == before + 1, path
        assert fake_seerr[-1].method == method
        assert fake_seerr[-1].url.path == f"/api/v1/{path}"
        assert response.status_code == 502, path

    page = client.get("/integrations/seerr/api/discover/movies", params={"page": 2, "sortBy": "popularity.desc"}, headers=auth)
    assert page.status_code == 502
    assert fake_seerr[-1].url.query == b"page=2&sortBy=popularity.desc"


def test_proxy_still_refuses_near_misses(client: TestClient, auth: dict, fake_seerr):
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    before = len(fake_seerr)
    for method, path in [
        ("GET", "discover/keyword/5/movies"),
        ("GET", "tv/5/season/2/episode/1"),
        ("GET", "person/31/../../settings/main"),
        ("GET", "user/1/settings/main"),
        ("POST", "user/1/quota"),
        ("DELETE", "movie/7"),
        ("POST", "request/3/pending"),
        ("GET", "genres/person"),
        ("GET", "service/lidarr"),
        ("GET", "service/radarr/0/test"),
        ("POST", "service/radarr"),
        ("GET", "settings/radarr"),
    ]:
        assert client.request(method, f"/integrations/seerr/api/{path}", headers=auth).status_code in (404, 405), path
    assert len(fake_seerr) == before


def test_private_addresses_are_for_the_admin_only(client: TestClient, auth: dict, fake_seerr):
    # The admin (first account) runs the server and may point at their home network.
    assert client.put("/integrations/seerr", json={"url": "http://home.example.com:5055", "api_key": KEY}, headers=auth).status_code == 200

    other = second_user(client)
    for url in ("http://home.example.com:5055", "http://localhost:5055", "http://10.0.0.5", "http://[::1]:5055", "http://169.254.169.254"):
        response = client.put("/integrations/seerr", json={"url": url, "api_key": KEY}, headers=other)
        assert response.status_code == 422, url
    assert (
        client.put("/integrations/seerr", json={"url": "https://user:pw@seerr.example.com", "api_key": KEY}, headers=other).status_code
        == 422
    )


def test_disconnect_and_account_deletion_remove_the_key(client: TestClient, auth: dict, db: Session, fake_seerr):
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    assert client.delete("/integrations/seerr", headers=auth).status_code == 204
    assert db.scalar(select(ServiceConnection)) is None
    assert client.get("/integrations/seerr/api/search", headers=auth).status_code == 404

    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    assert client.post("/auth/delete-account", json={"password": PASSWORD}, headers=auth).status_code == 204
    db.expire_all()
    assert db.scalar(select(ServiceConnection)) is None
    assert db.scalar(select(User)) is None


def test_seerr_redirects_are_not_followed(client: TestClient, auth: dict, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(seerr, "resolve", lambda host, port: ["203.0.113.10"])
    monkeypatch.setattr(seerr, "_is_public", lambda address: True)
    monkeypatch.setattr(
        seerr, "transport", httpx.MockTransport(lambda request: httpx.Response(302, headers={"Location": "http://127.0.0.1/"}))
    )
    response = client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    assert response.status_code == 502
    assert "redirect" in response.json()["detail"]


def test_every_table_belongs_to_a_user():
    """Guards the multi-user audit: any new table must carry the owner (or be one of the known server-wide ones)."""
    from app.models import Base

    # exercises: the shared exercise catalogue (public dataset, read-only to users, no personal data).
    server_wide = {"users", "server_settings", "exercises"}
    for table in Base.metadata.sorted_tables:
        if table.name in server_wide:
            continue
        owner = table.c.get("user_id") if "user_id" in table.c else table.c.get("id") if table.name == "profiles" else None
        assert owner is not None, f"{table.name} has no user_id"
        assert any(fk.column.table.name == "users" and fk.ondelete == "CASCADE" for fk in owner.foreign_keys), table.name


PHONE = "ExponentPushToken[made-up-phone-0001]"


def test_seerr_webhook_pushes_to_this_users_phones_in_their_language(
    client: TestClient, auth: dict, fake_seerr, monkeypatch: pytest.MonkeyPatch
):
    sent: list[list[dict]] = []

    def expo(request: httpx.Request) -> httpx.Response:
        messages = json.loads(request.content)
        sent.append(messages)
        tickets = [
            {"status": "error", "details": {"error": "DeviceNotRegistered"}}
            if m["to"] == "ExponentPushToken[old-phone-0002]"
            else {"status": "ok"}
            for m in messages
        ]
        return httpx.Response(200, json={"data": tickets})

    monkeypatch.setattr(push, "transport", httpx.MockTransport(expo))
    path = client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth).json()["webhook_path"]
    assert client.put("/integrations/push", json={"token": PHONE, "language": "ar"}, headers=auth).status_code == 204
    client.put("/integrations/push", json={"token": "ExponentPushToken[old-phone-0002]", "language": "en"}, headers=auth)
    assert client.put("/integrations/push", json={"token": "not a token"}, headers=auth).status_code == 422

    payload = {"notification_type": "MEDIA_AVAILABLE", "subject": "Made Up Movie (2026)", "media": {"media_type": "movie", "tmdbId": "7"}}
    assert client.post(path, json=payload).status_code == 204
    by_phone = {m["to"]: m for m in sent[0]}
    assert by_phone[PHONE]["title"] == "جاهز للمشاهدة"
    assert by_phone[PHONE]["body"] == "Made Up Movie (2026)"
    assert by_phone[PHONE]["data"] == {"url": "/title?kind=movie&id=7"}
    assert by_phone["ExponentPushToken[old-phone-0002]"]["title"] == "Ready to watch"

    # Expo said the old phone is gone, so the next one only goes to the phone that's left.
    client.post(path, json={"notification_type": "TEST_NOTIFICATION", "subject": "Test"})
    assert [m["to"] for m in sent[1]] == [PHONE]

    # A guessed address, or another user's id with this signature, gets nothing out.
    assert client.post(path[:-4] + "0000", json=payload).status_code == 404
    other = client.get("/auth/me", headers=second_user(client)).json()["id"]
    assert client.post(path.replace(path.split("/")[-2], other), json=payload).status_code == 404
    assert len(sent) == 2


def test_new_request_names_who_asked():
    texts, data = seerr.notification(
        {
            "notification_type": "MEDIA_PENDING",
            "subject": "Made Up Show",
            "media": {"media_type": "tv", "tmdbId": "9"},
            "request": {"requestedBy_username": "Sara"},
        }
    )
    assert texts["ar"] == ("طلب جديد ينتظر موافقتك", "Made Up Show · طلبه Sara")
    assert texts["en"][1] == "Made Up Show · by Sara"
    assert data == {"url": "/title?kind=tv&id=9"}
    assert seerr.notification({}) is None


def test_proxy_allows_the_discover_rails_and_nothing_next_to_them():
    for path in [
        "settings/discover",
        "media",
        "discover/movies/studio/2",
        "discover/tv/network/213",
        "discover/watchlist",
        "watchproviders/tv",
        "collection/10",
    ]:
        assert seerr.allowed("GET", path), path
    for path in ["settings/main", "settings/discover/reset", "media/5", "watchproviders/regions", "collection/10/request"]:
        assert not seerr.allowed("GET", path), path
    assert not seerr.allowed("POST", "settings/discover")


def test_proxy_allows_managing_a_title_and_nothing_wider():
    assert seerr.allowed("POST", "media/12/available")
    assert seerr.allowed("DELETE", "media/12") and seerr.allowed("DELETE", "media/12/file")
    assert seerr.allowed("POST", "blocklist") and seerr.allowed("DELETE", "blocklist/603")
    assert not seerr.allowed("POST", "media/12/unknown")
    assert not seerr.allowed("GET", "media/12/watch_data")
    assert not seerr.allowed("POST", "blocklist/collection/10")


def test_proxy_sends_a_request_edit_with_its_body(client: TestClient, auth: dict, fake_seerr):
    client.put("/integrations/seerr", json={"url": "https://seerr.example.com", "api_key": KEY}, headers=auth)
    response = client.put("/integrations/seerr/api/request/3", json={"mediaType": "tv", "seasons": [1, 2], "userId": 4}, headers=auth)
    sent = fake_seerr[-1]
    assert (sent.method, sent.url.path) == ("PUT", "/api/v1/request/3")
    assert json.loads(sent.content) == {"mediaType": "tv", "seasons": [1, 2], "userId": 4}
    assert response.status_code == 200
    assert seerr.allowed("GET", "user") and not seerr.allowed("GET", "user/1/settings/main")
    assert not seerr.allowed("PUT", "request") and not seerr.allowed("PUT", "user/4")


def test_proxy_allows_the_users_page_and_nothing_next_to_it():
    for method, path in [("GET", "user/4"), ("GET", "user/4/requests"), ("GET", "user/4/watchlist"), ("PUT", "user"), ("DELETE", "user/4")]:
        assert seerr.allowed(method, path), path
    for method, path in [
        ("GET", "user/4/settings/main"),
        ("POST", "user"),
        ("POST", "user/import-from-plex"),
        ("GET", "user/4/pushSubscriptions"),
        ("DELETE", "user"),
    ]:
        assert not seerr.allowed(method, path), path


def test_proxy_never_deletes_the_owner():
    assert not seerr.allowed("DELETE", "user/1")
    assert seerr.allowed("DELETE", "user/12") and seerr.allowed("DELETE", "user/10")
