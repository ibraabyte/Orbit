"""Each user's own AI: their key, provider, model and instructions.

The providers are fakes (httpx2.MockTransport, a stand-in Anthropic client); every key here is made up.
"""

import json
from collections.abc import Iterator
from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AiConnection, User
from app.security import decrypt_secret
from app.services import whoop_ai
from tests.conftest import bearer, sign_up

GOOD_KEY = "made-up-ai-key-0001"
OTHER_KEY = "made-up-ai-key-0002"
INSIGHT = {"summary": "ملخص", "highlights": ["أ"], "recommendations": ["ب"]}
SUMMARY = {"start": "2026-10-01", "end": "2026-10-30", "daily": []}
OPENAI = {"provider": "openai", "model": "made-up-model", "api_key": GOOD_KEY}


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.headers.get("Authorization") not in (f"Bearer {GOOD_KEY}", f"Bearer {OTHER_KEY}"):
            return httpx.Response(401, json={"error": {"message": f"bad key {request.headers.get('Authorization')}"}})
        body = json.loads(request.content)
        if body["model"] == "no-such-model":
            return httpx.Response(404, json={"error": {"message": "model not found"}})
        content = json.dumps(INSIGHT, ensure_ascii=False) if "response_format" in body else "OK"
        return httpx.Response(200, json={"model": body["model"], "choices": [{"finish_reason": "stop", "message": {"content": content}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield calls


def second_user(client: TestClient) -> dict[str, str]:
    return bearer(sign_up(client, email="other@example.com"))


def user_id(db: Session, email: str):
    return db.scalar(select(User.id).where(User.email == email))


def test_connect_checks_the_key_and_stores_it_encrypted(client: TestClient, auth: dict, db: Session, provider):
    bad = client.put("/integrations/ai", json={**OPENAI, "api_key": "wrong-key-123"}, headers=auth)
    assert bad.status_code == 409
    assert "wrong-key-123" not in bad.text
    assert db.scalar(select(AiConnection)) is None

    response = client.put("/integrations/ai", json={**OPENAI, "instructions": " ركز على النوم "}, headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["connected"] is True and body["configured"] is True
    assert (body["provider"], body["model"], body["instructions"]) == ("openai", "made-up-model", "ركز على النوم")

    row = db.scalar(select(AiConnection))
    assert row.api_key != GOOD_KEY
    assert decrypt_secret(row.api_key) == GOOD_KEY
    for text in (response.text, client.get("/integrations", headers=auth).text, client.get("/export", headers=auth).text):
        assert GOOD_KEY not in text
    assert client.get("/integrations", headers=auth).json()["ai"]["provider"] == "openai"


def test_a_model_the_provider_refuses_is_not_saved(client: TestClient, auth: dict, db: Session, provider):
    response = client.put("/integrations/ai", json={**OPENAI, "model": "no-such-model"}, headers=auth)
    assert response.status_code == 502
    assert db.scalar(select(AiConnection)) is None


def test_only_claude_may_leave_the_model_empty(client: TestClient, auth: dict, monkeypatch, provider):
    assert client.put("/integrations/ai", json={"provider": "openai", "api_key": GOOD_KEY}, headers=auth).status_code == 422
    unknown = {"provider": "my-server", "model": "m", "api_key": GOOD_KEY}
    assert client.put("/integrations/ai", json=unknown, headers=auth).status_code == 422

    class Messages:
        def create(self, **kwargs):
            return SimpleNamespace(stop_reason="end_turn", content=[], model=kwargs["model"])

    monkeypatch.setattr(whoop_ai, "_anthropic", lambda api_key: SimpleNamespace(messages=Messages()))
    body = client.put("/integrations/ai", json={"provider": "anthropic", "api_key": GOOD_KEY}, headers=auth).json()
    assert body["model"] == get_settings().insights_model


def test_changing_only_the_instructions_keeps_the_key_without_a_new_check(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    checks = len(provider)
    update = {"provider": "openai", "model": "made-up-model", "instructions": "Write in English"}
    response = client.put("/integrations/ai", json=update, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["instructions"] == "Write in English"
    assert len(provider) == checks
    assert decrypt_secret(db.scalar(select(AiConnection)).api_key) == GOOD_KEY


def test_a_new_provider_or_first_connection_needs_a_key(client: TestClient, auth: dict, provider):
    no_key = {"provider": "openai", "model": "made-up-model"}
    assert client.put("/integrations/ai", json=no_key, headers=auth).status_code == 422
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    # An OpenAI key must not be sent to some other company.
    assert client.put("/integrations/ai", json={**no_key, "provider": "gemini"}, headers=auth).status_code == 422
    assert all(call.url.host == "api.openai.com" for call in provider)


def test_each_user_gets_only_their_own_key(client: TestClient, auth: dict, db: Session, provider):
    other = second_user(client)
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    assert client.get("/integrations/ai", headers=other).json()["connected"] is False
    client.put("/integrations/ai", json={**OPENAI, "provider": "gemini", "api_key": OTHER_KEY}, headers=other)

    mine = whoop_ai.access_for(db, user_id(db, "me@example.com"))
    theirs = whoop_ai.access_for(db, user_id(db, "other@example.com"))
    assert (mine.provider, mine.api_key) == ("openai", GOOD_KEY)
    assert (theirs.provider, theirs.api_key) == ("gemini", OTHER_KEY)

    client.delete("/integrations/ai", headers=other)
    assert whoop_ai.access_for(db, user_id(db, "other@example.com")) is None
    assert whoop_ai.access_for(db, user_id(db, "me@example.com")) is not None


def test_the_servers_key_is_for_the_admin_only(client: TestClient, auth: dict, db: Session, monkeypatch):
    other = second_user(client)
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "made-up-server-key")
    admin = whoop_ai.access_for(db, user_id(db, "me@example.com"))
    assert (admin.provider, admin.api_key) == ("anthropic", "made-up-server-key")
    assert whoop_ai.access_for(db, user_id(db, "other@example.com")) is None

    assert client.get("/integrations/ai", headers=auth).json()["configured"] is True
    assert client.get("/integrations/ai", headers=other).json()["configured"] is False
    assert client.get("/whoop/status", headers=other).json()["ai_configured"] is False
    assert client.post("/whoop/insights", headers=other).status_code == 503


def test_their_own_key_wins_over_the_servers(client: TestClient, auth: dict, db: Session, monkeypatch, provider):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "made-up-server-key")
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    assert whoop_ai.access_for(db, user_id(db, "me@example.com")).api_key == GOOD_KEY


def test_account_deletion_removes_the_key(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    db.delete(db.get(User, user_id(db, "me@example.com")))
    db.commit()
    assert db.scalar(select(AiConnection)) is None


@pytest.mark.parametrize(
    ("name", "url"),
    [
        ("openai", "https://api.openai.com/v1/chat/completions"),
        ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"),
        ("openrouter", "https://openrouter.ai/api/v1/chat/completions"),
    ],
)
def test_write_insight_goes_to_the_chosen_provider(provider, name: str, url: str):
    access = whoop_ai.AiAccess(name, "made-up-model", GOOD_KEY, "ركز على النوم")
    insight, model = whoop_ai.write_insight(SUMMARY, access)
    assert insight.summary == "ملخص" and model == "made-up-model"
    assert str(provider[0].url) == url
    body = json.loads(provider[0].content)
    assert body["response_format"]["json_schema"]["schema"]["properties"].keys() == {"summary", "highlights", "recommendations"}
    assert "ركز على النوم" in body["messages"][0]["content"]


def test_a_reply_wrapped_in_a_code_fence_still_reads(monkeypatch):
    fenced = f"```json\n{json.dumps(INSIGHT)}\n```"
    answer = {"model": "m", "choices": [{"finish_reason": "stop", "message": {"content": fenced}}]}
    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(lambda request: httpx.Response(200, json=answer)))
    insight, _ = whoop_ai.write_insight(SUMMARY, whoop_ai.AiAccess("openrouter", "m", GOOD_KEY))
    assert insight.highlights == ["أ"]


def test_a_reply_that_isnt_the_summary_says_so(monkeypatch):
    answer = {"model": "m", "choices": [{"finish_reason": "stop", "message": {"content": "Sorry, no."}}]}
    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(lambda request: httpx.Response(200, json=answer)))
    with pytest.raises(whoop_ai.InsightUnavailable):
        whoop_ai.write_insight(SUMMARY, whoop_ai.AiAccess("openai", "m", GOOD_KEY))


def test_provider_errors_never_show_the_key(provider):
    bad = whoop_ai.AiAccess("openai", "m", "secret-wrong-key")
    with pytest.raises(whoop_ai.AiKeyRejected) as refused:
        whoop_ai.write_insight(SUMMARY, bad)
    assert "secret-wrong-key" not in str(refused.value)


def test_claude_gets_the_users_key_and_instructions(monkeypatch):
    keys: list[str] = []
    calls: list[dict] = []

    class Messages:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(stop_reason="end_turn", parsed_output=whoop_ai.Insight(**INSIGHT), model=kwargs["model"])

    def fake_client(api_key: str):
        keys.append(api_key)
        return SimpleNamespace(beta=SimpleNamespace(messages=Messages()))

    monkeypatch.setattr(whoop_ai, "_anthropic", fake_client)
    whoop_ai.write_insight(SUMMARY, whoop_ai.AiAccess("anthropic", "claude-made-up", GOOD_KEY, "Write in English"))
    assert keys == [GOOD_KEY]
    assert calls[0]["model"] == "claude-made-up"
    assert "Write in English" in calls[0]["system"]
    # Effort and the fallback are only known to fit the default model.
    assert "output_config" not in calls[0] and "fallbacks" not in calls[0]
