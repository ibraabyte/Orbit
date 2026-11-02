"""ChatGPT must power the same private WHOOP flow as the existing API keys."""

import json
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode, urlparse

import httpx2 as httpx
import jwt
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AiConnection, User
from app.security import encrypt_secret
from app.services import whoop_ai
from tests.conftest import bearer, sign_up


def test_overview_includes_chatgpt_without_exposing_credentials(client, auth):
    response = client.get("/integrations", headers=auth)
    assert response.status_code == 200
    assert response.json().get("chatgpt") == {"status": "not_connected"}


def test_connected_chatgpt_powers_whoop_without_leaking_or_crossing_users(client, auth, db, monkeypatch):
    from app.models import ChatgptConnection
    from app.services import chatgpt_ai

    mine = db.scalar(select(User.id))
    db.add(ChatgptConnection(user_id=mine, status="connected", credentials=encrypt_secret("{}")))
    db.add(
        AiConnection(user_id=mine, provider="openai", model="key-model", api_key=encrypt_secret("unused-key"), instructions="ركز على النوم")
    )
    db.commit()
    other = bearer(sign_up(client, email="other-chatgpt@example.com"))
    seen = []

    def respond(session, user_id, messages, tools=None):
        seen.append((user_id, messages))
        return SimpleNamespace(text=json.dumps({"summary": "ملخص", "highlights": ["أ"], "recommendations": ["ب"]}), model="codex-test")

    monkeypatch.setattr(chatgpt_ai, "respond", respond)
    monkeypatch.setattr(
        "app.services.whoop_analytics.load_summary",
        lambda *args, **kwargs: {
            "has_data": True,
            "start": "2026-10-01",
            "end": "2026-10-30",
            "daily": [],
        },
    )
    overview = client.get("/integrations", headers=auth).json()
    assert overview["chatgpt"] == {"status": "connected"}
    assert overview["ai"]["configured"] is True
    assert client.get("/integrations", headers=other).json()["chatgpt"] == {"status": "not_connected"}
    result = client.post("/whoop/insights", headers=auth)
    assert result.status_code == 201, result.text
    assert result.json()["summary"] == "ملخص"
    assert result.json()["model"] == "codex-test"
    assert seen[0][0] == mine and "ركز على النوم" in seen[0][1][0]["content"]
    assert client.post("/whoop/insights", headers=other).status_code == 503
    assert client.get("/export", headers=auth).json().get("chatgpt_connections") is None


def test_chatgpt_failure_is_safe_for_the_existing_whoop_route(monkeypatch):
    from app.services import chatgpt_ai, chatgpt_auth

    def expired(*args, **kwargs):
        raise chatgpt_auth.ChatgptExpired("Reconnect ChatGPT in Integrations.")

    monkeypatch.setattr(chatgpt_ai, "respond", expired)
    access = whoop_ai.ChatgptAccess(None, None)
    with pytest.raises(whoop_ai.InsightUnavailable, match="Reconnect"):
        whoop_ai.write_insight({"start": "2026-10-01", "end": "2026-10-30"}, access)


def test_chatgpt_login_401_refresh_and_whoop_summary_end_to_end(client, auth, db, monkeypatch):
    from app.models import ChatgptConnection
    from app.services import chatgpt_ai, chatgpt_auth

    monkeypatch.setattr(get_settings(), "chatgpt_model", "codex-test")
    monkeypatch.setattr(
        "app.services.whoop_analytics.load_summary",
        lambda *args, **kwargs: {
            "has_data": True,
            "start": "2026-10-01",
            "end": "2026-10-30",
            "daily": [],
        },
    )
    tokens = [
        jwt.encode(
            {"https://api.openai.com/auth": {"chatgpt_account_id": "test-account"}, "version": version},
            "synthetic-key-long-enough-for-hs256-signing",
            algorithm="HS256",
        )
        for version in (1, 2)
    ]
    grants = []
    bearer_tokens = []

    def oauth(request):
        form = parse_qs(request.content.decode())
        grants.append(form["grant_type"][0])
        if grants[-1] == "refresh_token":
            assert form["refresh_token"] == ["synthetic-refresh"]
            return httpx.Response(200, json={"access_token": tokens[1], "expires_in": 3600})
        return httpx.Response(
            200,
            json={
                "access_token": tokens[0],
                "refresh_token": "synthetic-refresh",
                "id_token": "synthetic-id",
                "expires_in": 3600,
            },
        )

    insight = {"summary": "ملخص كامل", "highlights": ["أ"], "recommendations": ["ب"]}

    def codex(request):
        bearer_tokens.append(request.headers["authorization"])
        assert request.headers["chatgpt-account-id"] == "test-account"
        if len(bearer_tokens) == 1:
            return httpx.Response(401)
        text = json.dumps(insight, ensure_ascii=False)
        wire = "data: " + json.dumps({"type": "response.output_text.delta", "delta": text}) + "\n\n"
        wire += "data: " + json.dumps({"type": "response.completed", "response": {"status": "completed", "output": []}}) + "\n\n"
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=wire)

    monkeypatch.setattr(chatgpt_auth, "transport", httpx.MockTransport(oauth))
    monkeypatch.setattr(chatgpt_ai, "transport", httpx.MockTransport(codex))
    started = client.post("/integrations/chatgpt/start", headers=auth).json()
    state = parse_qs(urlparse(started["authorization_url"]).query)["state"][0]
    callback = "http://localhost:1455/auth/callback?" + urlencode({"code": "synthetic-code", "state": state})
    assert client.post("/integrations/chatgpt/finish", headers=auth, json={"callback_url": callback}).json() == {"status": "connected"}
    response = client.post("/whoop/insights", headers=auth)
    assert response.status_code == 201, response.text
    assert response.json()["summary"] == insight["summary"]
    assert grants == ["authorization_code", "refresh_token"]
    assert bearer_tokens == [f"Bearer {token}" for token in tokens]
    assert client.get("/whoop/insights/latest", headers=auth).json()["id"] == response.json()["id"]
    from app.security import decrypt_secret

    stored = json.loads(decrypt_secret(db.scalar(select(ChatgptConnection)).credentials))
    assert stored["access_token"] == tokens[1] and stored["refresh_token"] == "synthetic-refresh"
    for endpoint in ("/integrations", "/integrations/chatgpt", "/export"):
        body = client.get(endpoint, headers=auth).text
        assert all(secret not in body for secret in [*tokens, "synthetic-refresh", "synthetic-id", "test-account"])
