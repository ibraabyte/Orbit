"""The AI companies page: live model lists (also the key test), one key shared for OpenAI text and speech, and
OpenRouter's account sign-in.

Every company here is a fake (httpx2.MockTransport); every key and code is made up.
"""

import json
from collections.abc import Iterator
from urllib.parse import parse_qs, urlparse

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiConnection, VoiceConnection
from app.security import decrypt_secret
from app.services import ai_providers, voice_stt, whoop_ai
from tests.conftest import bearer, sign_up

KEY = "made-up-provider-key-01"
MINTED = "sk-or-made-up-minted-key"

OPENAI_MODELS = {
    "data": [
        {"id": "gpt-old", "created": 100},
        {"id": "gpt-new", "created": 300},
        {"id": "text-embedding-3-small", "created": 400},
        {"id": "gpt-4o-transcribe", "created": 200},
        {"id": "gpt-realtime", "created": 250},
        {"id": "dall-e-3", "created": 50},
        {"id": "gpt-image-1", "created": 60},
    ]
}


@pytest.fixture
def companies(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        url = str(request.url)
        if url == ai_providers.OPENROUTER_KEYS_URL:
            body = json.loads(request.content)
            ok = body.get("code") == "made-up-code" and body.get("code_challenge_method") == "S256" and body.get("code_verifier")
            return httpx.Response(200, json={"key": MINTED}) if ok else httpx.Response(403, json={})
        key = (
            request.headers.get("x-api-key")
            or request.headers.get("xi-api-key")
            or request.headers.get("Authorization", "").removeprefix("Bearer ")
        )
        if key not in (KEY, MINTED):
            return httpx.Response(401, json={"error": "bad key"})
        host = request.url.host
        if host == "api.openai.com" and request.url.path.endswith("/models"):
            return httpx.Response(200, json=OPENAI_MODELS)
        if host == "api.openai.com":  # the save check (chat) and the speech check
            return httpx.Response(200, json={"model": "gpt-new", "choices": [{"message": {"content": "OK"}}], "text": ""})
        if host == "api.anthropic.com":
            return httpx.Response(
                200, json={"data": [{"id": "claude-made-up-2", "display_name": "Claude Made Up 2"}, {"id": "claude-made-up-1"}]}
            )
        if host == "generativelanguage.googleapis.com":
            return httpx.Response(200, json={"data": [{"id": "models/gemini-made-up-flash"}, {"id": "models/text-embedding-004"}]})
        if url == "https://openrouter.ai/api/v1/key":
            return httpx.Response(200, json={"data": {"label": "made-up"}})
        if host == "openrouter.ai":
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "made-up/chat", "name": "Made Up Chat", "created": 5, "architecture": {"output_modalities": ["text"]}},
                        {"id": "made-up/painter", "name": "Painter", "created": 9, "architecture": {"output_modalities": ["image"]}},
                    ]
                },
            )
        if host == "api.groq.com":
            return httpx.Response(200, json={"data": [{"id": "whisper-large-v3"}, {"id": "llama-made-up"}]})
        if host == "api.elevenlabs.io":
            return httpx.Response(200, json=[{"model_id": "eleven_made_up_tts"}])
        return httpx.Response(404, json={})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(ai_providers, "transport", transport)
    monkeypatch.setattr(whoop_ai, "transport", transport)
    monkeypatch.setattr(voice_stt, "transport", transport)
    yield calls


def _models(client: TestClient, auth: dict, provider: str, key: str | None = KEY):
    return client.post(f"/integrations/providers/{provider}/models", json={"api_key": key} if key else {}, headers=auth)


def test_lists_openai_chat_speech_and_realtime_models_newest_first(client: TestClient, auth: dict, companies):
    response = _models(client, auth, "openai")
    assert response.status_code == 200
    models = response.json()["models"]
    assert [m["id"] for m in models if m["kind"] == "text"] == ["gpt-new", "gpt-old"]
    assert [m["id"] for m in models if m["kind"] == "speech"] == ["gpt-4o-transcribe"]
    assert [m["id"] for m in models if m["kind"] == "realtime"] == ["gpt-realtime"]


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        ("anthropic", [("claude-made-up-2", "text"), ("claude-made-up-1", "text")]),
        ("gemini", [("gemini-made-up-flash", "text")]),
        ("openrouter", [("made-up/chat", "text")]),
        ("groq", [("whisper-large-v3", "speech")]),
        ("elevenlabs", [("scribe_v1", "speech")]),
    ],
)
def test_each_company_lists_only_models_orbit_can_use(client: TestClient, auth: dict, companies, provider, expected):
    response = _models(client, auth, provider)
    assert response.status_code == 200, response.text
    assert [(m["id"], m["kind"]) for m in response.json()["models"]] == expected


def test_a_bad_key_is_a_conflict_and_nothing_is_saved(client: TestClient, auth: dict, db: Session, companies):
    response = _models(client, auth, "anthropic", "wrong-key-1234")
    assert response.status_code == 409
    assert "wrong-key-1234" not in response.text
    assert db.scalar(select(AiConnection)) is None


def test_openrouter_checks_the_key_itself_because_its_list_is_public(client: TestClient, auth: dict, companies):
    assert _models(client, auth, "openrouter", "wrong-key-1234").status_code == 409
    assert str(companies[-1].url) == "https://openrouter.ai/api/v1/key"


def test_without_a_key_it_uses_the_saved_one_or_asks_for_one(client: TestClient, auth: dict, companies):
    assert _models(client, auth, "groq", None).status_code == 404
    assert client.put("/integrations/voice", json={"provider": "groq", "api_key": KEY}, headers=auth).status_code == 200
    assert _models(client, auth, "groq", None).json()["models"][0]["id"] == "whisper-large-v3"
    # A key saved for one company is never sent to another.
    assert _models(client, auth, "elevenlabs", None).status_code == 404


def test_the_openai_key_is_typed_once_for_text_and_speech(client: TestClient, auth: dict, db: Session, companies):
    saved = client.put("/integrations/ai", json={"provider": "openai", "model": "gpt-new", "api_key": KEY}, headers=auth)
    assert saved.status_code == 200
    voice = client.put("/integrations/voice", json={"provider": "openai"}, headers=auth)
    assert voice.status_code == 200, voice.text
    assert decrypt_secret(db.scalar(select(VoiceConnection)).api_key) == KEY
    # Groq has no saved key, so it still needs one.
    assert client.put("/integrations/voice", json={"provider": "groq"}, headers=auth).status_code == 422


def test_and_the_voice_key_works_for_text_the_other_way(client: TestClient, auth: dict, db: Session, companies):
    assert client.put("/integrations/voice", json={"provider": "openai", "api_key": KEY}, headers=auth).status_code == 200
    saved = client.put("/integrations/ai", json={"provider": "openai", "model": "gpt-new"}, headers=auth)
    assert saved.status_code == 200, saved.text
    assert decrypt_secret(db.get(AiConnection, (db.scalar(select(VoiceConnection)).user_id, "openai")).api_key) == KEY


def _start(client: TestClient, auth: dict, **body) -> tuple[str, str, dict]:
    response = client.post("/integrations/openrouter/start", json=body, headers=auth)
    assert response.status_code == 200, response.text
    url = urlparse(response.json()["authorization_url"])
    query = {key: values[0] for key, values in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == ai_providers.OPENROUTER_AUTH_URL
    assert query["code_challenge_method"] == "S256"
    callback = urlparse(query["callback_url"])
    return callback.path, query["code_challenge"], query


def test_openrouter_sign_in_saves_the_key_it_makes_and_goes_back_to_the_app(client: TestClient, auth: dict, db: Session, companies):
    path, challenge, query = _start(client, auth)
    assert path.startswith("/integrations/openrouter/callback/")
    # The verifier is never in the page's address, only its hash.
    assert "verifier" not in query["callback_url"]
    back = client.get(f"{path}?code=made-up-code", follow_redirects=False)
    assert back.status_code == 302
    assert back.headers["location"] == "orbit://ai-provider?id=openrouter&status=connected"
    exchange = json.loads(companies[-1].content)
    assert ai_providers.openrouter_challenge(exchange["code_verifier"]) == challenge
    row = db.scalar(select(AiConnection))
    assert (row.provider, row.model, decrypt_secret(row.api_key)) == ("openrouter", "openrouter/auto", MINTED)
    assert client.get("/integrations", headers=auth).json()["ais"]["default"] == "openrouter"


def test_openrouter_sign_in_keeps_a_picked_model(client: TestClient, auth: dict, db: Session, companies):
    assert (
        client.put("/integrations/ai", json={"provider": "openrouter", "model": "made-up/chat", "api_key": KEY}, headers=auth).status_code
        == 200
    )
    path, _, _ = _start(client, auth)
    client.get(f"{path}?code=made-up-code", follow_redirects=False)
    row = db.scalar(select(AiConnection))
    assert (row.model, decrypt_secret(row.api_key)) == ("made-up/chat", MINTED)


def test_openrouter_sign_in_failures_go_back_to_the_app_and_save_nothing(client: TestClient, auth: dict, db: Session, companies):
    path, _, _ = _start(client, auth, return_to="exp://192.0.2.1:8081/--/ai-provider?id=openrouter")
    denied = client.get(path, follow_redirects=False)
    assert denied.headers["location"] == "exp://192.0.2.1:8081/--/ai-provider?id=openrouter&status=denied"
    wrong = client.get(f"{path}?code=not-the-code", follow_redirects=False)
    assert wrong.headers["location"].endswith("status=error")
    forged = client.get("/integrations/openrouter/callback/not-a-state?code=made-up-code", follow_redirects=False)
    assert forged.headers["location"] == "orbit://ai-provider?id=openrouter&status=expired"
    assert db.scalar(select(AiConnection)) is None


def test_openrouter_sign_in_only_returns_into_the_app(client: TestClient, auth: dict):
    response = client.post("/integrations/openrouter/start", json={"return_to": "https://example.com/steal"}, headers=auth)
    assert response.status_code == 422


def test_a_sign_in_belongs_to_the_account_that_started_it(client: TestClient, auth: dict, db: Session, companies):
    path, _, _ = _start(client, auth)
    other = bearer(sign_up(client, "other@example.com"))
    client.get(f"{path}?code=made-up-code", follow_redirects=False)
    assert client.get("/integrations", headers=other).json()["ais"]["choices"] == []
    assert client.get("/integrations", headers=auth).json()["ais"]["choices"][0]["provider"] == "openrouter"


def test_needs_sign_in(client: TestClient):
    assert client.post("/integrations/providers/openai/models", json={"api_key": KEY}).status_code == 401
    assert client.post("/integrations/openrouter/start").status_code == 401
