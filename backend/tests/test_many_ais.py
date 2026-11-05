"""More than one AI per user: each provider keeps its own key, one is the default, and a request may pick another.

Providers are fakes (httpx2.MockTransport); every key here is made up.
"""

import json
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiConnection, ChatgptConnection, Profile, User
from app.security import decrypt_secret, encrypt_secret
from app.services import whoop_ai
from tests.conftest import bearer, sign_up

OPENAI_KEY = "made-up-openai-key-01"
GEMINI_KEY = "made-up-gemini-key-01"
OPENAI = {"provider": "openai", "model": "made-up-gpt", "api_key": OPENAI_KEY}
GEMINI = {"provider": "gemini", "model": "made-up-gemini", "api_key": GEMINI_KEY}


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.headers.get("Authorization") not in (f"Bearer {OPENAI_KEY}", f"Bearer {GEMINI_KEY}"):
            return httpx.Response(401, json={})
        body = json.loads(request.content)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": "OK"}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield calls


def me(db: Session, email: str = "me@example.com"):
    return db.scalar(select(User.id).where(User.email == email))


def test_a_second_provider_keeps_the_first(client: TestClient, auth: dict, db: Session, provider):
    assert client.put("/integrations/ai", json=OPENAI, headers=auth).status_code == 200
    assert client.put("/integrations/ai", json=GEMINI, headers=auth).status_code == 200
    rows = {row.provider: row for row in db.scalars(select(AiConnection))}
    assert set(rows) == {"openai", "gemini"}
    assert decrypt_secret(rows["openai"].api_key) == OPENAI_KEY
    assert decrypt_secret(rows["gemini"].api_key) == GEMINI_KEY

    ais = client.get("/integrations", headers=auth).json()["ais"]
    # Nothing chosen yet: the first connected is the default, as before.
    assert [c["provider"] for c in ais["choices"]] == ["openai", "gemini"]
    assert ais["default"] == "openai"
    assert [c["is_default"] for c in ais["choices"]] == [True, False]
    for text in (json.dumps(ais), client.get("/export", headers=auth).text):
        assert OPENAI_KEY not in text and GEMINI_KEY not in text


def test_the_default_and_a_picked_ai(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    client.put("/integrations/ai", json=GEMINI, headers=auth)
    response = client.put("/integrations/ai/default", json={"provider": "gemini"}, headers=auth)
    assert response.status_code == 200 and response.json()["default"] == "gemini"
    assert db.get(Profile, me(db)).ai_default == "gemini"

    assert whoop_ai.access_for(db, me(db)).api_key == GEMINI_KEY
    assert whoop_ai.access_for(db, me(db), "openai").api_key == OPENAI_KEY
    # Something not connected is never used, even when picked.
    assert whoop_ai.access_for(db, me(db), "anthropic") is None
    assert whoop_ai.access_for(db, me(db), "chatgpt") is None
    assert client.put("/integrations/ai/default", json={"provider": "anthropic"}, headers=auth).status_code == 409
    assert client.put("/integrations/ai/default", json={"provider": "my-server"}, headers=auth).status_code == 422


def test_a_request_goes_to_the_picked_provider(client: TestClient, auth: dict, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    client.put("/integrations/ai", json=GEMINI, headers=auth)
    provider.clear()
    body = {"question": "What is overdue?", "history": [], "locale": "en"}
    assert client.post("/assistant/ask?ai=gemini", json=body, headers=auth).status_code == 200
    assert provider[-1].url.host == "generativelanguage.googleapis.com"
    assert client.post("/assistant/ask", json=body, headers=auth).status_code == 200
    assert provider[-1].url.host == "api.openai.com"
    assert client.post("/assistant/ask?ai=anthropic", json=body, headers=auth).status_code == 409
    assert client.post("/assistant/ask?ai=nope", json=body, headers=auth).status_code == 422


def test_disconnecting_one_keeps_the_other_and_moves_the_default(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    client.put("/integrations/ai", json=GEMINI, headers=auth)
    client.put("/integrations/ai/default", json={"provider": "gemini"}, headers=auth)
    assert client.delete("/integrations/ai/gemini", headers=auth).status_code == 204
    ais = client.get("/integrations/ais", headers=auth).json()
    assert [c["provider"] for c in ais["choices"]] == ["openai"] and ais["default"] == "openai"
    # The old app's "Disconnect AI" still forgets every key.
    assert client.delete("/integrations/ai", headers=auth).status_code == 204
    assert db.scalar(select(AiConnection)) is None


def test_chatgpt_counts_as_a_choice(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    db.add(ChatgptConnection(user_id=me(db), status="connected", credentials=encrypt_secret("{}")))
    db.commit()
    ais = client.get("/integrations/ais", headers=auth).json()
    # ChatGPT first, as Orbit always used it before a key.
    assert [c["provider"] for c in ais["choices"]] == ["chatgpt", "openai"] and ais["default"] == "chatgpt"
    client.put("/integrations/ai/default", json={"provider": "openai"}, headers=auth)
    assert isinstance(whoop_ai.access_for(db, me(db)), whoop_ai.AiAccess)
    assert isinstance(whoop_ai.access_for(db, me(db), "chatgpt"), whoop_ai.ChatgptAccess)


def test_another_users_ais_are_never_used(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/ai", json=OPENAI, headers=auth)
    other = bearer(sign_up(client, email="other@example.com"))
    assert client.get("/integrations/ais", headers=other).json()["choices"] == []
    assert whoop_ai.access_for(db, me(db, "other@example.com"), "openai") is None
    assert client.put("/integrations/ai/default", json={"provider": "openai"}, headers=other).status_code == 409
