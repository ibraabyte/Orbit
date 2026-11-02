"""Sign in with Google, against a fake Google."""

from urllib.parse import parse_qs, urlparse

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Profile, User
from app.services import google_api
from tests.conftest import bearer

PASSWORD = "correct horse battery"
IDENTITY = {"sub": "google-1", "email": "me@example.com", "email_verified": True, "name": "Ibrahim"}


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> dict:
    """Google's answer for the signed-in person. Tests change it to play someone else."""
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "https://api.test/auth/google/callback")
    identity = dict(IDENTITY)

    def fake(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/token":
            return httpx.Response(200, json={"access_token": "google-access"})
        return httpx.Response(200, json=identity)

    monkeypatch.setattr(google_api, "transport", httpx.MockTransport(fake))
    return identity


def sign_in_with_google(client: TestClient, timezone: str = "Asia/Riyadh") -> tuple[dict, str]:
    """Walks the browser's path. Returns the deep link's query and the app's secret."""
    started = client.post("/auth/google/start", json={"return_to": "orbit://sign-in", "timezone": timezone}).json()
    state = parse_qs(urlparse(started["url"]).query)["state"][0]
    back = client.get("/auth/google/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert back.status_code == 302 and back.headers["location"].startswith("orbit://sign-in?")
    return {key: value[0] for key, value in parse_qs(urlparse(back.headers["location"]).query).items()}, started["secret"]


def finish(client: TestClient, code: str, secret: str):
    return client.post("/auth/google/finish", json={"code": code, "secret": secret, "device": "ios"})


def test_hidden_until_configured(client: TestClient):
    assert client.get("/auth/status").json()["google"] is False
    assert client.post("/auth/google/start", json={}).status_code == 503


def test_first_google_account_becomes_admin_with_a_profile(client: TestClient, google: dict, db: Session):
    assert client.get("/auth/status").json()["google"] is True
    link, secret = sign_in_with_google(client)
    assert link["status"] == "ok"
    tokens = finish(client, link["code"], secret)
    assert tokens.status_code == 200
    assert client.get("/auth/me", headers=bearer(tokens.json())).json()["is_admin"] is True
    user = db.scalar(select(User))
    assert user.google_sub == "google-1"
    profile = db.get(Profile, user.id)
    assert (profile.display_name, profile.timezone) == ("Ibrahim", "Asia/Riyadh")
    # No password was chosen, so none works.
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": ""}).status_code == 401


def test_existing_account_with_the_same_email_is_linked(client: TestClient, google: dict, db: Session):
    signed_up = client.post("/auth/sign-up", json={"email": "ME@example.com", "password": PASSWORD}).json()
    link, secret = sign_in_with_google(client)
    assert finish(client, link["code"], secret).json()["user_id"] == signed_up["user_id"]
    # The password still works, and a changed Google email still finds the same account.
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": PASSWORD}).status_code == 200
    google["email"] = "new@example.com"
    link, secret = sign_in_with_google(client)
    assert finish(client, link["code"], secret).json()["user_id"] == signed_up["user_id"]
    assert len(db.scalars(select(User)).all()) == 1


def test_unverified_email_never_reaches_an_account(client: TestClient, google: dict):
    client.post("/auth/sign-up", json={"email": "me@example.com", "password": PASSWORD})
    google["email_verified"] = False
    link, _ = sign_in_with_google(client)
    assert link == {"status": "unverified"}


def test_another_google_account_on_a_linked_email_is_refused(client: TestClient, google: dict):
    sign_in_with_google(client)
    google["sub"] = "google-2"
    link, _ = sign_in_with_google(client)
    assert link == {"status": "error"}


def test_closed_sign_ups_refuse_new_people_only(client: TestClient, google: dict, db: Session):
    client.post("/auth/sign-up", json={"email": "owner@example.com", "password": PASSWORD})
    link, _ = sign_in_with_google(client)
    assert link == {"status": "closed"}
    assert len(db.scalars(select(User)).all()) == 1


def test_the_code_needs_the_secret_of_whoever_started(client: TestClient, google: dict):
    link, _ = sign_in_with_google(client)
    assert finish(client, link["code"], "someone-elses-secret").status_code == 401
    assert finish(client, "not-a-code", "x").status_code == 401


def test_the_code_is_not_an_access_token(client: TestClient, google: dict):
    link, _ = sign_in_with_google(client)
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {link['code']}"}).status_code == 401


def test_bad_callbacks_go_back_to_the_app(client: TestClient, google: dict):
    assert "status=expired" in client.get("/auth/google/callback", params={"state": "forged"}, follow_redirects=False).headers["location"]
    started = client.post("/auth/google/start", json={"return_to": "orbit://sign-in"}).json()
    state = parse_qs(urlparse(started["url"]).query)["state"][0]
    denied = client.get("/auth/google/callback", params={"error": "access_denied", "state": state}, follow_redirects=False)
    assert "status=denied" in denied.headers["location"]


def test_return_to_must_be_the_app(client: TestClient, google: dict):
    assert client.post("/auth/google/start", json={"return_to": "https://evil.example"}).status_code == 422
