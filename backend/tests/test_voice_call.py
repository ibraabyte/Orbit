"""The voice call with the assistant: a short-lived OpenAI Realtime secret per call, and the call's tool calls answered
with the text assistant's own tools (nothing saved here).

OpenAI is a fake (httpx2.MockTransport); every key, title and amount here is made up.
"""

import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AiConnection, Expense, Task, User, VoiceConnection
from app.security import encrypt_secret
from app.services import voice_call
from tests.conftest import bearer, sign_up

AI_KEY = "made-up-openai-ai-key-0001"
VOICE_KEY = "made-up-openai-voice-key-0002"
SECRET = "ek_made_up_secret_0003"


@pytest.fixture
def openai(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        key = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if key not in (AI_KEY, VOICE_KEY):
            return httpx.Response(401, json={"error": {"message": "bad key"}})
        return httpx.Response(200, json={"value": SECRET, "expires_at": 1_900_000_000, "session": {"type": "realtime"}})

    monkeypatch.setattr(voice_call, "transport", httpx.MockTransport(handler))
    yield calls


def me(db: Session, email: str = "me@example.com") -> uuid.UUID:
    return db.scalar(select(User.id).where(User.email == email))


def add_ai_key(db: Session, user_id: uuid.UUID, key: str = AI_KEY, provider: str = "openai") -> None:
    db.add(AiConnection(user_id=user_id, provider=provider, model="made-up-model", api_key=encrypt_secret(key)))
    db.commit()


def add_task(db: Session, user_id: uuid.UUID, title: str, due: int | None = None) -> Task:
    # Open tasks are listed by due time, so a due day fixes the order of their refs.
    due_at = datetime(2030, 1, due, 9, tzinfo=UTC) if due else None
    task = Task(user_id=user_id, title=title, due_at=due_at)
    db.add(task)
    db.commit()
    return task


def session(client: TestClient, auth: dict, **extra):
    return client.post("/assistant/call/session", json={"locale": "ar", **extra}, headers=auth)


def tool(client: TestClient, auth: dict, name: str, refs: dict | None = None, **arguments):
    return client.post("/assistant/call/tool", json={"name": name, "arguments": json.dumps(arguments), "refs": refs or {}}, headers=auth)


def test_no_call_without_an_openai_key(client: TestClient, auth: dict, db: Session, openai):
    assert client.get("/assistant/call", headers=auth).json()["available"] is False
    # Another company's key is never sent to OpenAI.
    add_ai_key(db, me(db), provider="anthropic")
    assert client.get("/assistant/call", headers=auth).json()["available"] is False
    assert session(client, auth).status_code == 409
    assert tool(client, auth, "find_items", kind="task", text="x").status_code == 409
    assert openai == []


def test_the_voice_models_openai_key_comes_first(client: TestClient, auth: dict, db: Session, openai):
    user_id = me(db)
    add_ai_key(db, user_id)
    assert client.get("/assistant/call", headers=auth).json() == {
        "available": True,
        "source": "ai",
        "voices": list(voice_call.VOICES),
    }
    db.add(VoiceConnection(user_id=user_id, provider="openai", model="gpt-4o-transcribe", api_key=encrypt_secret(VOICE_KEY)))
    db.commit()
    assert client.get("/assistant/call", headers=auth).json()["source"] == "voice"
    assert session(client, auth).status_code == 200
    assert openai[-1].headers["Authorization"] == f"Bearer {VOICE_KEY}"


def test_a_session_is_a_short_secret_with_the_assistants_tools(client: TestClient, auth: dict, db: Session, openai):
    user_id = me(db)
    add_ai_key(db, user_id)
    add_task(db, user_id, "اشتري حليب")
    response = session(client, auth, voice="cedar")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["client_secret"] == SECRET and body["expires_at"] == 1_900_000_000 and body["model"] == "gpt-realtime"
    [(ref, item)] = [(name, value) for name, value in body["refs"].items() if value["kind"] == "task"]
    assert ref == "task-1" and item["label"] == "اشتري حليب"
    # The saved key went to OpenAI only, never back to the phone.
    assert AI_KEY not in response.text

    request = openai[-1]
    assert str(request.url) == "https://api.openai.com/v1/realtime/client_secrets"
    config = json.loads(request.content)
    assert config["expires_after"] == {"anchor": "created_at", "seconds": 120}
    sent = config["session"]
    assert sent["model"] == "gpt-realtime" and sent["audio"]["output"]["voice"] == "cedar"
    assert sent["audio"]["input"]["turn_detection"]["interrupt_response"] is True
    assert sent["audio"]["input"]["transcription"]["language"] == "ar"
    names = {"find_items", "propose_create", "propose_update", "propose_delete", "propose_complete_task"}
    assert {t["name"] for t in sent["tools"]} == names
    assert all(t["type"] == "function" and "parameters" in t for t in sent["tools"])
    assert "اشتري حليب" in sent["instructions"] and "task-1" in sent["instructions"]
    assert "Saudi" in sent["instructions"]


def test_an_unknown_voice_is_refused(client: TestClient, auth: dict, db: Session, openai):
    add_ai_key(db, me(db))
    assert session(client, auth, voice="no-such-voice").status_code == 422
    assert openai == []


def test_a_refused_key_is_a_clear_error(client: TestClient, auth: dict, db: Session, openai):
    add_ai_key(db, me(db), key="made-up-wrong-key")
    response = session(client, auth)
    assert response.status_code == 409
    assert "OpenAI" in response.json()["detail"]
    assert "made-up-wrong-key" not in response.text


def test_openai_down_is_a_502(client: TestClient, auth: dict, db: Session, monkeypatch: pytest.MonkeyPatch):
    add_ai_key(db, me(db))
    monkeypatch.setattr(voice_call, "transport", httpx.MockTransport(lambda request: httpx.Response(500)))
    assert session(client, auth).status_code == 502


def test_a_tool_call_proposes_and_saves_nothing(client: TestClient, auth: dict, db: Session, openai):
    add_ai_key(db, me(db))
    response = tool(client, auth, "propose_create", kind="expense", fields={"merchant": "غداء", "amount": 45, "category": "food"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert json.loads(body["output"])["ok"] is True
    [action] = body["actions"]
    assert action["op"] == "create" and action["kind"] == "expense" and action["fields"]["currency"] == "SAR"
    assert action["fields"]["spent_at"].endswith("+03:00")
    assert db.scalar(select(func.count()).select_from(Expense)) == 0
    # Nothing went to OpenAI: tool calls are answered by Orbit alone.
    assert openai == []


def test_refs_from_the_session_work_across_tool_calls(client: TestClient, auth: dict, db: Session, openai):
    user_id = me(db)
    add_ai_key(db, user_id)
    task = add_task(db, user_id, "اتصل بالسباك")
    refs = session(client, auth).json()["refs"]
    response = tool(client, auth, "propose_complete_task", refs=refs, ref="task-1")
    [action] = response.json()["actions"]
    assert action == {"op": "complete", "kind": "task", "id": str(task.id), "label": "اتصل بالسباك", "fields": {}}
    db.refresh(task)
    assert task.status == "open"


def test_find_items_adds_refs_without_reusing_a_name(client: TestClient, auth: dict, db: Session, openai):
    user_id = me(db)
    add_ai_key(db, user_id)
    first = add_task(db, user_id, "مهمة أولى", due=1)
    add_task(db, user_id, "مهمة ثانية", due=2)
    refs = session(client, auth).json()["refs"]
    assert set(refs) >= {"task-1", "task-2"}
    # The first task is gone since the call started; its ref is dropped, and a new one must not take "task-2".
    db.delete(db.get(Task, first.id))
    db.commit()
    third = add_task(db, user_id, "مهمة ثالثة")
    body = tool(client, auth, "find_items", refs=refs, kind="task", text="ثالثة").json()
    found = json.loads(body["output"])["items"]
    assert [item["ref"] for item in found] == ["task-3"]
    assert body["refs"]["task-3"]["id"] == str(third.id)
    assert body["refs"]["task-2"]["label"] == "مهمة ثانية"
    assert "task-1" not in body["refs"]


def test_someone_elses_ids_in_refs_are_ignored(client: TestClient, auth: dict, db: Session, openai):
    add_ai_key(db, me(db))
    sign_up(client, "other@example.com")
    theirs = add_task(db, me(db, "other@example.com"), "مهمتهم")
    forged = {"task-1": {"kind": "task", "id": str(theirs.id), "label": "مهمتهم"}}
    response = tool(client, auth, "propose_delete", refs=forged, kind="task", ref="task-1")
    assert response.status_code == 200
    body = response.json()
    assert body["actions"] == [] and "Unknown ref" in json.loads(body["output"])["error"]
    assert body["refs"] == {}


def test_bad_arguments_are_told_to_the_model(client: TestClient, auth: dict, db: Session, openai):
    add_ai_key(db, me(db))
    response = client.post("/assistant/call/tool", json={"name": "propose_create", "arguments": "{not json"}, headers=auth)
    assert response.status_code == 200
    assert "JSON object" in json.loads(response.json()["output"])["error"]


def test_a_call_needs_sign_in(client: TestClient):
    assert client.get("/assistant/call").status_code == 401
    assert client.post("/assistant/call/session", json={"locale": "en"}).status_code == 401
    other = bearer(sign_up(client, "x@example.com"))
    assert client.get("/assistant/call", headers=other).json()["available"] is False
