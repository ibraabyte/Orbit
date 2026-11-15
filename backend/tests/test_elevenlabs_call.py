"""The voice call through ElevenLabs Agents, with the ElevenLabs key saved as the user's voice model.

ElevenLabs is a fake (httpx2.MockTransport) that keeps the tools and agents made in it; every key, id and name here
is made up.
"""

import json
import uuid
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiConnection, Task, User, VoiceConnection
from app.security import encrypt_secret
from app.services import assistant_actions, elevenlabs_call, voice_call

EL_KEY = "made-up-elevenlabs-key-0001"
OPENAI_KEY = "made-up-openai-key-0002"
TOKEN = "made-up-conversation-token-0003"
ARABIC_VOICE = "ArabicVoice000000001"
OTHER_VOICE = "EnglishVoice00000002"
SIGNED_URL = "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=made-up&conversation_signature=made-up"


class FakeElevenLabs:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.tools: dict[str, dict] = {}
        self.agents: dict[str, dict] = {}
        self.refuse = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.refuse or request.headers.get("xi-api-key") != EL_KEY:
            return httpx.Response(401, json={"detail": "bad key"})
        path, method = request.url.path, request.method
        body = json.loads(request.content) if request.content else {}
        if path == "/v1/voices":
            return httpx.Response(
                200,
                json={
                    "voices": [
                        {"voice_id": OTHER_VOICE, "name": "Amber", "labels": {"accent": "american"}},
                        {"voice_id": ARABIC_VOICE, "name": "Rakan", "labels": {"accent": "saudi", "language": "ar"}},
                        {"voice_id": "bad id!", "name": "Broken"},
                    ]
                },
            )
        if path == "/v1/convai/tools" and method == "GET":
            return httpx.Response(200, json={"tools": [{"id": i, "tool_config": c} for i, c in self.tools.items()], "has_more": False})
        if path == "/v1/convai/tools" and method == "POST":
            tool_id = f"tool_{len(self.tools) + 1}"
            self.tools[tool_id] = body["tool_config"]
            return httpx.Response(200, json={"id": tool_id, "tool_config": body["tool_config"]})
        if path.startswith("/v1/convai/tools/") and method == "PATCH":
            tool_id = path.rsplit("/", 1)[1]
            if tool_id not in self.tools:
                return httpx.Response(404, json={})
            self.tools[tool_id] = body["tool_config"]
            return httpx.Response(200, json={"id": tool_id})
        if path == "/v1/convai/agents" and method == "GET":
            agents = [{"agent_id": i, "name": a["name"], "tags": a["tags"]} for i, a in self.agents.items()]
            return httpx.Response(200, json={"agents": agents, "has_more": False})
        if path == "/v1/convai/agents/create":
            agent_id = f"agent_{len(self.agents) + 1}"
            self.agents[agent_id] = body
            return httpx.Response(200, json={"agent_id": agent_id})
        if path.startswith("/v1/convai/agents/") and method == "PATCH":
            agent_id = path.rsplit("/", 1)[1]
            if agent_id not in self.agents:
                return httpx.Response(404, json={})
            self.agents[agent_id] = body
            return httpx.Response(200, json={"agent_id": agent_id})
        if path == "/v1/convai/conversation/token":
            if request.url.params.get("agent_id") not in self.agents:
                return httpx.Response(404, json={})
            return httpx.Response(200, json={"token": TOKEN})
        if path == "/v1/convai/conversation/get-signed-url":
            if request.url.params.get("agent_id") not in self.agents:
                return httpx.Response(404, json={})
            return httpx.Response(200, json={"signed_url": SIGNED_URL})
        return httpx.Response(500, json={})

    def made(self, kind: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == "POST" and r.url.path == f"/v1/convai/{kind}"]


@pytest.fixture
def eleven(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeElevenLabs]:
    fake = FakeElevenLabs()
    monkeypatch.setattr(elevenlabs_call, "transport", httpx.MockTransport(fake.handler))
    monkeypatch.setattr(elevenlabs_call, "_setups", {})
    yield fake


def me(db: Session) -> uuid.UUID:
    return db.scalar(select(User.id).where(User.email == "me@example.com"))


def add_elevenlabs(db: Session, user_id: uuid.UUID) -> None:
    db.add(VoiceConnection(user_id=user_id, provider="elevenlabs", model="scribe_v1", api_key=encrypt_secret(EL_KEY)))
    db.commit()


def session(client: TestClient, auth: dict, **extra):
    return client.post("/assistant/call/session", json={"locale": "ar", "providers": ["openai", "elevenlabs"], **extra}, headers=auth)


def test_the_elevenlabs_voice_model_can_take_the_call(client: TestClient, auth: dict, db: Session, eleven):
    add_elevenlabs(db, me(db))
    status = client.get("/assistant/call", headers=auth).json()
    assert status["available"] is True and status["provider"] == "elevenlabs" and status["source"] == "voice"
    # Arabic voices first; a malformed id is dropped.
    assert status["voice_options"] == [
        {"id": ARABIC_VOICE, "name": "Rakan", "arabic": True},
        {"id": OTHER_VOICE, "name": "Amber", "arabic": False},
    ]
    assert EL_KEY not in json.dumps(status)
    features = {row["feature"]: row for row in client.get("/integrations/features", headers=auth).json()}
    assert features["call"]["options"] == ["elevenlabs"] and features["call"]["effective"] == "elevenlabs"
    # The phone agent can use it too.
    assert features["phone_agent"]["options"] == ["elevenlabs"] and features["phone_agent"]["effective"] == "elevenlabs"


def test_a_session_makes_the_agent_once_and_hands_over_a_token(client: TestClient, auth: dict, db: Session, eleven):
    user_id = me(db)
    add_elevenlabs(db, user_id)
    db.add(Task(user_id=user_id, title="اشتري حليب"))
    db.commit()
    response = session(client, auth, voice=ARABIC_VOICE)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "elevenlabs" and body["conversation_token"] == TOKEN and body["client_secret"] == ""
    assert EL_KEY not in response.text
    assert set(body["tools"]) == {"find_items", "propose_create", "propose_update", "propose_delete", "propose_complete_task"}
    overrides = body["overrides"]
    assert overrides["tts"] == {"voiceId": ARABIC_VOICE}
    assert overrides["agent"]["language"] == "ar" and overrides["agent"]["firstMessage"]
    assert "اشتري حليب" in overrides["agent"]["prompt"]["prompt"] and "task-1" in overrides["agent"]["prompt"]["prompt"]

    # The agent in the user's account: private, no voice recording, the call's overrides allowed, no personal data.
    [agent] = eleven.agents.values()
    assert agent["name"] == "Orbit assistant" and "orbit" in agent["tags"]
    assert agent["platform_settings"]["auth"] == {"enable_auth": True}
    assert agent["platform_settings"]["privacy"] == {"record_voice": False}
    assert "حليب" not in json.dumps(agent, ensure_ascii=False)
    assert sorted(agent["conversation_config"]["agent"]["prompt"]["tool_ids"]) == sorted(eleven.tools)
    assert all(t["type"] == "client" and t["expects_response"] and t["description"].endswith("(Orbit)") for t in eleven.tools.values())

    # The next call reuses it: only a new token.
    eleven.requests.clear()
    assert session(client, auth).status_code == 200
    assert [(r.method, r.url.path) for r in eleven.requests] == [("GET", "/v1/convai/conversation/token")]


def test_after_a_restart_the_agent_is_found_again(client: TestClient, auth: dict, db: Session, eleven, monkeypatch):
    add_elevenlabs(db, me(db))
    assert session(client, auth).status_code == 200
    monkeypatch.setattr(elevenlabs_call, "_setups", {})
    assert session(client, auth).status_code == 200
    assert len(eleven.agents) == 1 and len(eleven.made("tools")) == 5


def test_a_removed_agent_is_made_again(client: TestClient, auth: dict, db: Session, eleven):
    add_elevenlabs(db, me(db))
    assert session(client, auth).status_code == 200
    eleven.agents.clear()
    eleven.tools.clear()
    response = session(client, auth)
    assert response.status_code == 200, response.text
    assert len(eleven.agents) == 1 and len(eleven.tools) == 5


def test_hiding_a_section_updates_the_tools(client: TestClient, auth: dict, db: Session, eleven, monkeypatch):
    add_elevenlabs(db, me(db))
    assert session(client, auth).status_code == 200
    real = assistant_actions.tools
    monkeypatch.setattr(assistant_actions, "tools", lambda hidden=frozenset(): real(frozenset({"finance"})))
    eleven.requests.clear()
    assert session(client, auth).status_code == 200
    assert any(r.method == "PATCH" and "/convai/tools/" in r.url.path for r in eleven.requests)
    kinds = next(t for t in eleven.tools.values() if t["name"] == "find_items")["parameters"]["properties"]["kind"]["enum"]
    assert "expense" not in kinds


def test_an_old_app_gets_openai_or_a_clear_answer(client: TestClient, auth: dict, db: Session, eleven, monkeypatch):
    user_id = me(db)
    add_elevenlabs(db, user_id)
    old = client.post("/assistant/call/session", json={"locale": "ar"}, headers=auth)
    assert old.status_code == 409 and "Update the app" in old.json()["detail"]
    assert eleven.requests == []
    # With an OpenAI key too, an old app calls with OpenAI.
    secret = httpx.Response(200, json={"value": "ek_x", "expires_at": 1})
    monkeypatch.setattr(voice_call, "transport", httpx.MockTransport(lambda request: secret))
    db.add(AiConnection(user_id=user_id, provider="openai", model="made-up", api_key=encrypt_secret(OPENAI_KEY)))
    db.commit()
    assert client.put("/integrations/features/call", json={"choice": "elevenlabs"}, headers=auth).status_code == 200
    assert client.post("/assistant/call/session", json={"locale": "ar"}, headers=auth).json()["provider"] == "openai"
    assert session(client, auth).json()["provider"] == "elevenlabs"


def test_a_refused_key_and_a_bad_voice(client: TestClient, auth: dict, db: Session, eleven):
    add_elevenlabs(db, me(db))
    assert session(client, auth, voice="not a voice").status_code == 422
    eleven.refuse = True
    response = session(client, auth)
    assert response.status_code == 409 and "ElevenLabs refused" in response.json()["detail"]
    # The status still says the call can start: the voice list is just empty.
    status = client.get("/assistant/call", headers=auth).json()
    assert status["provider"] == "elevenlabs" and status["voice_options"] == []


def test_fields_sent_as_json_text_are_read_back(client: TestClient, auth: dict, db: Session, eleven):
    add_elevenlabs(db, me(db))
    fields = json.dumps({"merchant": "غداء", "amount": 45, "category": "food"}, ensure_ascii=False)
    response = client.post(
        "/assistant/call/tool",
        json={"name": "propose_create", "arguments": json.dumps({"kind": "expense", "fields": fields}), "refs": {}},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    [action] = response.json()["actions"]
    assert action["kind"] == "expense" and action["fields"]["amount"] == 45


def test_tools_fit_elevenlabs(eleven):
    for tool in assistant_actions.tools():
        config = elevenlabs_call.tool_config(tool)

        def check(prop: dict) -> None:
            assert prop["type"] in ("string", "number", "integer", "boolean", "object", "array")
            if prop["type"] == "object":
                assert prop["properties"]
                for value in prop["properties"].values():
                    assert value.get("description") or value["type"] in ("object", "array")
                    check(value)

        check(config["parameters"])
    create = elevenlabs_call.tool_config(next(t for t in assistant_actions.tools() if t.name == "propose_create"))
    assert create["parameters"]["properties"]["fields"]["type"] == "string"
