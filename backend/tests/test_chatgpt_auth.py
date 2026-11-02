import base64
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlencode, urlparse

import httpx2 as httpx
import jwt
import pytest
from sqlalchemy import select

from app.models import User
from app.security import decrypt_secret, encrypt_secret
from tests.conftest import bearer, sign_up

JWT_TEST_KEY = "chatgpt-test-key-long-enough-for-hs256"


def start(client, auth):
    response = client.post("/integrations/chatgpt/start", headers=auth)
    assert response.status_code == 200, response.text
    return parse_qs(urlparse(response.json()["authorization_url"]).query)


def callback(state, **values):
    return "http://localhost:1455/auth/callback?" + urlencode({"code": "good-code", "state": state, **values})


def connect(client, auth):
    query = start(client, auth)
    return client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": callback(query["state"][0])})


@pytest.fixture
def provider(monkeypatch):
    from app.services import chatgpt_auth

    calls = []

    def respond(request):
        calls.append(request)
        form = parse_qs(request.content.decode())
        assert str(request.url) == "https://auth.openai.com/oauth/token"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        assert form["client_id"] == ["app_EMoamEEZ73f0CkXaXp7hrann"]
        token = jwt.encode({"https://api.openai.com/auth": {"chatgpt_account_id": "account-123"}}, JWT_TEST_KEY, algorithm="HS256")
        return httpx.Response(200, json={
            "access_token": token, "refresh_token": "refresh-private", "id_token": "id-private", "expires_in": 3600,
        })

    monkeypatch.setattr(chatgpt_auth, "transport", httpx.MockTransport(respond))
    return calls


def test_chatgpt_endpoints_require_orbit_sign_in(client):
    assert client.get("/integrations/chatgpt").status_code == 401
    assert client.post("/integrations/chatgpt/start").status_code == 401
    assert client.post("/integrations/chatgpt/finish", json={"callback_url": callback("s")}).status_code == 401
    assert client.delete("/integrations/chatgpt").status_code == 401


def test_start_creates_exact_pkce_and_encrypted_pending_state(client, auth, me, db):
    from app.models import ChatgptConnection

    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "not_connected"}
    query = start(client, auth)
    assert query["response_type"] == ["code"]
    assert query["client_id"] == ["app_EMoamEEZ73f0CkXaXp7hrann"]
    assert query["redirect_uri"] == ["http://localhost:1455/auth/callback"]
    assert query["scope"] == ["openid profile email offline_access"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["id_token_add_organizations"] == ["true"]
    assert query["codex_cli_simplified_flow"] == ["true"]
    assert query["originator"] == ["codex_cli_rs"]
    row = db.get(ChatgptConnection, uuid.UUID(me["user_id"]))
    verifier = decrypt_secret(row.verifier)
    assert len(base64.urlsafe_b64decode(verifier + "==")) == 64
    assert len(base64.urlsafe_b64decode(query["state"][0] + "==")) == 32
    assert "=" not in verifier and "=" not in query["state"][0]
    assert query["code_challenge"] == [base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")]
    assert decrypt_secret(row.state) == query["state"][0]
    assert row.state != query["state"][0]
    assert row.status == "pending" and row.pending_expires_at > datetime.now(UTC)
    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "pending"}


@pytest.mark.parametrize("bad", [
    "http://localhost:1455/auth/callback?code=good-code&state=wrong",
    "https://evil.example/auth/callback?code=good-code&state={state}",
    "http://localhost:1455/wrong?code=good-code&state={state}",
    "http://localhost:1455/auth/callback?code=a&code=b&state={state}",
    "http://localhost:1455/auth/callback?code=a&state={state}&state={state}",
    "http://localhost:1455/auth/callback?code=a&state={state}#fragment",
    "http://localhost:1455/auth/callback?error=denied&state={state}",
])
def test_callback_rejects_wrong_state_and_bad_urls_without_token_exchange(client, auth, provider, bad):
    state = start(client, auth)["state"][0]
    response = client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": bad.format(state=state)})
    assert response.status_code == 422
    assert not provider


def test_finish_saves_only_encrypted_credentials_and_consumes_state(client, auth, me, db, provider):
    from app.models import ChatgptConnection

    query = start(client, auth)
    row = db.get(ChatgptConnection, uuid.UUID(me["user_id"]))
    verifier = decrypt_secret(row.verifier)
    url = callback(query["state"][0])
    response = client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": url})
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "connected"}
    form = parse_qs(provider[0].content.decode())
    assert form["code"] == ["good-code"] and form["code_verifier"] == [verifier]
    assert form["redirect_uri"] == ["http://localhost:1455/auth/callback"]
    db.expire_all()
    row = db.get(ChatgptConnection, uuid.UUID(me["user_id"]))
    assert row.verifier is None and row.state is None and row.pending_expires_at is None
    stored = json.loads(decrypt_secret(row.credentials))
    assert stored["account_id"] == "account-123" and stored["refresh_token"] == "refresh-private"
    assert stored["id_token"] == "id-private" and datetime.fromisoformat(stored["expires_at"]) > datetime.now(UTC)
    for secret in (stored["access_token"], stored["refresh_token"], stored["id_token"], stored["account_id"], stored["expires_at"]):
        assert secret not in row.credentials and secret not in response.text
    assert client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": url}).status_code == 409
    assert len(provider) == 1


def test_pending_state_is_per_user_and_expires(client, auth, me, db, provider):
    from app.models import ChatgptConnection

    state = start(client, auth)["state"][0]
    other = bearer(sign_up(client, "other@example.com"))
    assert client.post("/integrations/chatgpt/finish", headers=other, json={"callback_url": callback(state)}).status_code == 409
    row = db.get(ChatgptConnection, uuid.UUID(me["user_id"]))
    row.pending_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    assert client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": callback(state)}).status_code == 409
    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "expired"}
    assert not provider


def test_new_start_invalidates_the_previous_state(client, auth, provider):
    old = start(client, auth)["state"][0]
    new = start(client, auth)["state"][0]
    assert old != new
    assert client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": callback(old)}).status_code == 422
    assert not provider


def test_an_ai_request_cannot_erase_a_new_pending_login(client, auth, me, db):
    from app.models import ChatgptConnection
    from app.services import chatgpt_auth

    state = start(client, auth)["state"][0]
    with pytest.raises(chatgpt_auth.ChatgptExpired):
        chatgpt_auth.get_credentials(db, uuid.UUID(me["user_id"]))
    chatgpt_auth.mark_expired(db, uuid.UUID(me["user_id"]))
    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "pending"}
    db.expire_all()
    assert decrypt_secret(db.get(ChatgptConnection, uuid.UUID(me["user_id"])).state) == state


def test_refresh_before_expiry_keeps_omitted_refresh_token(client, auth, me, db, provider, monkeypatch):
    from app.models import ChatgptConnection
    from app.services import chatgpt_auth

    assert connect(client, auth).status_code == 200
    user_id = uuid.UUID(me["user_id"])
    row = db.get(ChatgptConnection, user_id)
    credentials = json.loads(decrypt_secret(row.credentials))
    credentials["expires_at"] = (datetime.now(UTC) + timedelta(seconds=30)).isoformat()
    row.credentials = encrypt_secret(json.dumps(credentials))
    db.commit()
    requests = []

    def refresh(request):
        requests.append(request)
        return httpx.Response(200, json={"access_token": credentials["access_token"], "expires_in": 7200})

    monkeypatch.setattr(chatgpt_auth, "transport", httpx.MockTransport(refresh))
    refreshed = chatgpt_auth.get_credentials(db, user_id)
    assert refreshed.refresh_token == "refresh-private" and refreshed.id_token == "id-private"
    assert refreshed.expires_at > datetime.now(UTC) + timedelta(hours=1)
    assert parse_qs(requests[0].content.decode()) == {
        "grant_type": ["refresh_token"], "refresh_token": ["refresh-private"], "client_id": ["app_EMoamEEZ73f0CkXaXp7hrann"],
    }
    chatgpt_auth.get_credentials(db, user_id)
    assert len(requests) == 1


def test_failed_refresh_expires_connection_without_leaking_tokens(client, auth, me, db, provider, monkeypatch):
    from app.services import chatgpt_auth

    assert connect(client, auth).status_code == 200
    monkeypatch.setattr(chatgpt_auth, "transport", httpx.MockTransport(lambda r: httpx.Response(400, json={"error": "refresh-private"})))
    with pytest.raises(chatgpt_auth.ChatgptExpired) as failure:
        chatgpt_auth.get_credentials(db, uuid.UUID(me["user_id"]), force_refresh=True)
    assert "refresh-private" not in str(failure.value)
    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "expired"}


def test_account_claim_falls_back_to_user_id(monkeypatch):
    from app.services import chatgpt_auth

    token = jwt.encode({"https://api.openai.com/auth": {"user_id": "fallback-user"}}, JWT_TEST_KEY, algorithm="HS256")
    monkeypatch.setattr(chatgpt_auth, "transport", httpx.MockTransport(lambda r: httpx.Response(200, json={
        "access_token": token, "refresh_token": "r", "id_token": "i", "expires_in": 3600,
    })))
    assert chatgpt_auth.exchange_code("code", "verifier").account_id == "fallback-user"


def test_disconnect_and_delete_account_remove_tokens(client, auth, me, db, provider):
    from app.models import ChatgptConnection

    assert connect(client, auth).status_code == 200
    assert client.delete("/integrations/chatgpt", headers=auth).status_code == 204
    assert client.get("/integrations/chatgpt", headers=auth).json() == {"status": "not_connected"}
    assert connect(client, auth).status_code == 200
    db.delete(db.get(User, uuid.UUID(me["user_id"])))
    db.commit()
    assert db.scalar(select(ChatgptConnection)) is None
