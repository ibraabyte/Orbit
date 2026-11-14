"""What each AI feature uses: one of the user's own connected models per feature, the default when nothing is picked,
and the default again (reported as stale) when the picked one's key is removed.

Providers are fakes (httpx2.MockTransport); every key here is made up.
"""

import json
import uuid
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiConnection, FeatureModel, User, VoiceConnection
from app.security import encrypt_secret
from app.services import feature_models, voice_call, whoop_ai
from tests.conftest import bearer, sign_up

OPENAI_KEY = "made-up-openai-key-11"
GEMINI_KEY = "made-up-gemini-key-11"
VOICE_KEY = "made-up-groq-voice-key-11"
SECRET = "ek_made_up_secret_11"


@pytest.fixture
def providers(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.url.path.endswith("/realtime/client_secrets"):
            return httpx.Response(200, json={"value": SECRET, "expires_at": 1_900_000_000})
        body = json.loads(request.content)
        content = '{"summary":"OK","plan":[]}' if "week" in json.dumps(body) else "OK"
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(voice_call, "transport", httpx.MockTransport(handler))
    yield calls


def me(db: Session, email: str = "me@example.com") -> uuid.UUID:
    return db.scalar(select(User.id).where(User.email == email))


def add_ai(db: Session, user_id: uuid.UUID, provider: str, key: str) -> None:
    db.add(AiConnection(user_id=user_id, provider=provider, model=f"made-up-{provider}", api_key=encrypt_secret(key)))
    db.commit()


def other_auth(client: TestClient) -> dict:
    return bearer(sign_up(client, email="other@example.com"))


def by_feature(response) -> dict[str, dict]:
    return {row["feature"]: row for row in response.json()}


ASK = {"question": "What is overdue?", "history": [], "locale": "en"}


def test_nothing_picked_is_the_default_for_every_feature(client: TestClient, auth: dict, db: Session):
    features = by_feature(client.get("/integrations/features", headers=auth))
    assert set(features) == set(feature_models.SHOWN)
    assert features["assistant"] == {
        "feature": "assistant",
        "kind": "ai",
        "choice": None,
        "effective": None,
        "default": None,
        "options": [],
        "stale": False,
    }
    # No voice model: the phone does speech. No OpenAI key: no realtime model to pick.
    assert features["speech"]["effective"] == "phone" and features["speech"]["options"] == ["phone"]
    assert features["call"]["options"] == [] and features["call"]["effective"] is None
    # The overview carries the same list for the Integrations screen.
    assert {row["feature"] for row in client.get("/integrations", headers=auth).json()["features"]} == set(feature_models.SHOWN)


def test_each_feature_uses_its_own_ai(client: TestClient, auth: dict, db: Session, providers):
    user_id = me(db)
    add_ai(db, user_id, "openai", OPENAI_KEY)
    add_ai(db, user_id, "gemini", GEMINI_KEY)
    features = by_feature(client.put("/integrations/features/food_photo", json={"choice": "gemini"}, headers=auth))
    assert features["food_photo"]["choice"] == "gemini" and features["food_photo"]["effective"] == "gemini"
    assert features["food_photo"]["options"] == ["openai", "gemini"]
    # The others stay on the default.
    assert features["assistant"]["choice"] is None and features["assistant"]["effective"] == "openai"

    assert whoop_ai.access_for(db, user_id, feature="food_photo").api_key == GEMINI_KEY
    assert whoop_ai.access_for(db, user_id, feature="assistant").api_key == OPENAI_KEY
    # A pick made on the screen (?ai=) still wins.
    assert whoop_ai.access_for(db, user_id, "openai", "food_photo").api_key == OPENAI_KEY

    client.put("/integrations/features/assistant", json={"choice": "gemini"}, headers=auth)
    providers.clear()
    assert client.post("/assistant/ask", json=ASK, headers=auth).status_code == 200
    assert providers[-1].url.host == "generativelanguage.googleapis.com"
    assert client.post("/assistant/ask?ai=openai", json=ASK, headers=auth).status_code == 200
    assert providers[-1].url.host == "api.openai.com"


def test_back_to_the_default(client: TestClient, auth: dict, db: Session):
    user_id = me(db)
    add_ai(db, user_id, "openai", OPENAI_KEY)
    add_ai(db, user_id, "gemini", GEMINI_KEY)
    client.put("/integrations/features/week", json={"choice": "gemini"}, headers=auth)
    features = by_feature(client.put("/integrations/features/week", json={"choice": None}, headers=auth))
    assert features["week"]["choice"] is None and features["week"]["effective"] == "openai"
    assert db.scalar(select(FeatureModel)) is None


def test_only_what_the_user_connected(client: TestClient, auth: dict, db: Session):
    add_ai(db, me(db), "openai", OPENAI_KEY)
    assert client.put("/integrations/features/assistant", json={"choice": "anthropic"}, headers=auth).status_code == 409
    assert client.put("/integrations/features/assistant", json={"choice": "chatgpt"}, headers=auth).status_code == 409
    # A realtime model is not an AI, and a feature that doesn't exist is refused.
    assert client.put("/integrations/features/assistant", json={"choice": "gpt-realtime"}, headers=auth).status_code == 409
    assert client.put("/integrations/features/nope", json={"choice": "openai"}, headers=auth).status_code == 422
    assert client.put("/integrations/features/phone_agent", json={"choice": "made-up-model"}, headers=auth).status_code == 409
    # No OpenAI key: no realtime model for the call or the phone agent.
    assert client.put("/integrations/features/phone_agent", json={"choice": "gpt-realtime"}, headers=other_auth(client)).status_code == 409
    assert db.scalar(select(FeatureModel)) is None


def test_a_removed_key_falls_back_and_is_reported(client: TestClient, auth: dict, db: Session, providers):
    user_id = me(db)
    add_ai(db, user_id, "openai", OPENAI_KEY)
    add_ai(db, user_id, "gemini", GEMINI_KEY)
    client.put("/integrations/features/assistant", json={"choice": "gemini"}, headers=auth)
    assert client.delete("/integrations/ai/gemini", headers=auth).status_code == 204

    features = by_feature(client.get("/integrations/features", headers=auth))
    assert features["assistant"]["choice"] == "gemini" and features["assistant"]["stale"] is True
    assert features["assistant"]["effective"] == "openai"
    providers.clear()
    assert client.post("/assistant/ask", json=ASK, headers=auth).status_code == 200
    assert providers[-1].url.host == "api.openai.com"

    # Connecting it again brings the pick back.
    add_ai(db, user_id, "gemini", GEMINI_KEY)
    features = by_feature(client.get("/integrations/features", headers=auth))
    assert features["assistant"]["stale"] is False and features["assistant"]["effective"] == "gemini"


def test_the_call_uses_the_picked_realtime_model(client: TestClient, auth: dict, db: Session, providers):
    add_ai(db, me(db), "openai", OPENAI_KEY)
    features = by_feature(client.get("/integrations/features", headers=auth))
    assert features["call"]["options"] == ["gpt-realtime", "gpt-realtime-mini"] and features["call"]["effective"] == "gpt-realtime"
    assert client.put("/integrations/features/call", json={"choice": "openai"}, headers=auth).status_code == 409
    assert client.put("/integrations/features/call", json={"choice": "gpt-realtime-mini"}, headers=auth).status_code == 200

    response = client.post("/assistant/call/session", json={"locale": "en"}, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json()["model"] == "gpt-realtime-mini"
    assert json.loads(providers[-1].content)["session"]["model"] == "gpt-realtime-mini"
    # The phone agent keeps its own choice.
    assert feature_models.realtime_model(db, me(db), "phone_agent") == "gpt-realtime"
    client.put("/integrations/features/phone_agent", json={"choice": "gpt-realtime-mini"}, headers=auth)
    assert feature_models.realtime_model(db, me(db), "phone_agent") == "gpt-realtime-mini"


def test_speech_can_stay_on_the_phone(client: TestClient, auth: dict, db: Session):
    user_id = me(db)
    db.add(VoiceConnection(user_id=user_id, provider="groq", model="whisper-large-v3", api_key=encrypt_secret(VOICE_KEY)))
    db.commit()
    features = by_feature(client.get("/integrations/features", headers=auth))
    # A voice model is on: the mic uses it, as before, unless the phone is picked.
    assert features["speech"]["effective"] == "cloud" and features["speech"]["options"] == ["phone", "cloud"]
    features = by_feature(client.put("/integrations/features/speech", json={"choice": "phone"}, headers=auth))
    assert features["speech"]["effective"] == "phone"

    client.put("/integrations/features/speech", json={"choice": "cloud"}, headers=auth)
    assert client.delete("/integrations/voice", headers=auth).status_code == 204
    features = by_feature(client.get("/integrations/features", headers=auth))
    assert features["speech"]["stale"] is True and features["speech"]["effective"] == "phone"


def test_another_users_choices_are_their_own(client: TestClient, auth: dict, db: Session):
    add_ai(db, me(db), "openai", OPENAI_KEY)
    client.put("/integrations/features/assistant", json={"choice": "openai"}, headers=auth)
    other = bearer(sign_up(client, email="other@example.com"))
    features = by_feature(client.get("/integrations/features", headers=other))
    assert features["assistant"]["choice"] is None and features["assistant"]["options"] == []
    assert client.put("/integrations/features/assistant", json={"choice": "openai"}, headers=other).status_code == 409


def test_features_need_sign_in(client: TestClient):
    assert client.get("/integrations/features").status_code == 401
    assert client.put("/integrations/features/assistant", json={"choice": None}).status_code == 401
