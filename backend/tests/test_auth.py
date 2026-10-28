from fastapi.testclient import TestClient

from app.config import get_settings
from tests.conftest import bearer, sign_up

PASSWORD = "correct horse battery"


def test_first_account_is_allowed_then_sign_ups_close(client: TestClient):
    assert client.get("/auth/status").json() == {"signups_open": True}
    first = client.post("/auth/sign-up", json={"email": "me@example.com", "password": PASSWORD, "display_name": "Ibrahim"})
    assert first.status_code == 201

    assert client.get("/auth/status").json() == {"signups_open": False}
    second = client.post("/auth/sign-up", json={"email": "other@example.com", "password": PASSWORD})
    assert second.status_code == 403


def test_sign_up_creates_profile(client: TestClient, auth: dict):
    profile = client.get("/profile", headers=auth).json()
    assert profile["display_name"] == "me"
    assert profile["timezone"] == "Asia/Riyadh"
    assert profile["weight_unit"] == "kg"
    assert profile["weekly_workout_minutes_target"] == 150
    assert "tasks" in profile["dashboard_modules"]


def test_email_is_unique_ignoring_case(client: TestClient, me: dict):
    get_settings().allow_signups = True
    response = client.post("/auth/sign-up", json={"email": "ME@Example.com", "password": PASSWORD})
    assert response.status_code == 409


def test_short_password_is_refused(client: TestClient):
    response = client.post("/auth/sign-up", json={"email": "me@example.com", "password": "short"})
    assert response.status_code == 422


def test_sign_in(client: TestClient, me: dict):
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": "nope"}).status_code == 401
    assert client.post("/auth/sign-in", json={"email": "nobody@example.com", "password": PASSWORD}).status_code == 401

    tokens = client.post("/auth/sign-in", json={"email": "Me@Example.com", "password": PASSWORD}).json()
    assert client.get("/auth/me", headers=bearer(tokens)).json()["email"] == "me@example.com"


def test_repeated_wrong_passwords_are_throttled(client: TestClient, me: dict):
    for _ in range(get_settings().login_attempts):
        assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": "nope"}).status_code == 401
    # Even the right password waits until the window passes.
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": PASSWORD}).status_code == 429


def test_protected_routes_need_a_valid_access_token(client: TestClient, me: dict):
    assert client.get("/tasks").status_code == 401
    assert client.get("/tasks", headers={"Authorization": "Bearer junk"}).status_code == 401
    # A refresh token is not an access token.
    assert client.get("/tasks", headers={"Authorization": f"Bearer {me['refresh_token']}"}).status_code == 401


def test_refresh_rotates_and_reuse_ends_the_session(client: TestClient, me: dict):
    rotated = client.post("/auth/refresh", json={"refresh_token": me["refresh_token"]})
    assert rotated.status_code == 200
    new = rotated.json()
    assert new["refresh_token"] != me["refresh_token"]

    # The old token coming back looks like theft: it fails and takes the newer one down with it.
    assert client.post("/auth/refresh", json={"refresh_token": me["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]}).status_code == 401


def test_sign_out_ends_only_that_device(client: TestClient, me: dict):
    other_device = client.post("/auth/sign-in", json={"email": "me@example.com", "password": PASSWORD}).json()
    assert client.post("/auth/sign-out", json={"refresh_token": me["refresh_token"]}).status_code == 204

    assert client.post("/auth/refresh", json={"refresh_token": me["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": other_device["refresh_token"]}).status_code == 200


def test_sign_out_everywhere(client: TestClient, me: dict):
    other_device = client.post("/auth/sign-in", json={"email": "me@example.com", "password": PASSWORD}).json()
    assert client.post("/auth/sign-out-everywhere", headers=bearer(me)).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": me["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": other_device["refresh_token"]}).status_code == 401


def test_change_password(client: TestClient, me: dict):
    wrong = client.post("/auth/password", headers=bearer(me), json={"current_password": "nope", "new_password": "a new long password"})
    assert wrong.status_code == 403

    changed = client.post("/auth/password", headers=bearer(me), json={"current_password": PASSWORD, "new_password": "a new long password"})
    assert changed.status_code == 200
    assert client.post("/auth/refresh", json={"refresh_token": me["refresh_token"]}).status_code == 401
    assert client.post("/auth/refresh", json={"refresh_token": changed.json()["refresh_token"]}).status_code == 200
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": "a new long password"}).status_code == 200


def test_delete_account_removes_everything(client: TestClient, me: dict):
    client.post("/tasks", headers=bearer(me), json={"title": "Renew istimara"})
    assert client.post("/auth/delete-account", headers=bearer(me), json={"password": "nope"}).status_code == 403
    assert client.post("/auth/delete-account", headers=bearer(me), json={"password": PASSWORD}).status_code == 204

    assert client.get("/tasks", headers=bearer(me)).status_code == 401
    assert client.post("/auth/sign-in", json={"email": "me@example.com", "password": PASSWORD}).status_code == 401
    # With no accounts left, the next sign-up is the "first" one again.
    assert sign_up(client)["user_id"] != me["user_id"]
