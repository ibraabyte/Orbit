"""The optional voice model: the user's own speech-to-text key, and the mic's recordings going through it.

The providers are fakes (httpx2.MockTransport); every key and recording here is made up.
"""

import base64
from collections.abc import Iterator

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import VoiceConnection
from app.security import decrypt_secret
from app.services import voice_stt
from tests.conftest import bearer, sign_up

GOOD_KEY = "made-up-voice-key-0001"
FAKE_AUDIO = base64.b64encode(b"\x00made-up-recording" * 20).decode()
SPOKEN = "ذكرني بكره أشتري حليب"


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        key = request.headers.get("xi-api-key") or request.headers.get("Authorization", "").removeprefix("Bearer ")
        if key != GOOD_KEY:
            return httpx.Response(401, json={"error": "bad key"})
        if b"no-such-model" in request.content:
            return httpx.Response(404, json={"error": "model not found"})
        return httpx.Response(200, json={"text": f"  {SPOKEN} "})

    monkeypatch.setattr(voice_stt, "transport", httpx.MockTransport(handler))
    yield calls


def test_no_voice_model_by_default(client: TestClient, auth: dict):
    assert client.get("/integrations/voice", headers=auth).json() == {
        "connected": False,
        "provider": None,
        "model": None,
        "connected_at": None,
    }
    assert client.get("/integrations", headers=auth).json()["voice"]["connected"] is False
    response = client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO}, headers=auth)
    assert response.status_code == 404


def test_connect_checks_the_key_with_silence_and_stores_it_encrypted(client: TestClient, auth: dict, db: Session, provider):
    bad = client.put("/integrations/voice", json={"provider": "groq", "api_key": "wrong-key-123"}, headers=auth)
    assert bad.status_code == 409
    assert "wrong-key-123" not in bad.text
    assert db.scalar(select(VoiceConnection)) is None

    response = client.put("/integrations/voice", json={"provider": "groq", "api_key": GOOD_KEY}, headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["connected"], body["provider"], body["model"]) == (True, "groq", "whisper-large-v3")
    # The check sent a silent WAV to Groq's OpenAI-style endpoint, never anything the user said.
    check = provider[-1]
    assert str(check.url) == "https://api.groq.com/openai/v1/audio/transcriptions"
    assert b"speech.wav" in check.content and b"audio/wav" in check.content

    row = db.scalar(select(VoiceConnection))
    assert row.api_key != GOOD_KEY and decrypt_secret(row.api_key) == GOOD_KEY
    for text in (response.text, client.get("/integrations", headers=auth).text, client.get("/export", headers=auth).text):
        assert GOOD_KEY not in text


def test_wrong_model_is_a_clear_error(client: TestClient, auth: dict, db: Session, provider):
    response = client.put("/integrations/voice", json={"provider": "openai", "model": "no-such-model", "api_key": GOOD_KEY}, headers=auth)
    assert response.status_code == 422
    assert "model" in response.json()["detail"]
    assert db.scalar(select(VoiceConnection)) is None


def test_saved_key_never_goes_to_another_provider(client: TestClient, auth: dict, provider):
    assert client.put("/integrations/voice", json={"provider": "openai", "api_key": GOOD_KEY}, headers=auth).status_code == 200
    # Same provider, new model, no key: keeps the saved key.
    changed = client.put("/integrations/voice", json={"provider": "openai", "model": "whisper-1"}, headers=auth)
    assert changed.status_code == 200 and changed.json()["model"] == "whisper-1"
    calls = len(provider)
    switched = client.put("/integrations/voice", json={"provider": "elevenlabs"}, headers=auth)
    assert switched.status_code == 422
    assert len(provider) == calls


def test_transcribe_sends_the_recording_and_returns_only_text(client: TestClient, auth: dict, provider):
    client.put("/integrations/voice", json={"provider": "elevenlabs", "api_key": GOOD_KEY}, headers=auth)
    response = client.post(
        "/integrations/voice/transcribe", json={"audio": FAKE_AUDIO, "media_type": "audio/m4a", "language": "ar"}, headers=auth
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"text": SPOKEN}
    sent = provider[-1]
    assert str(sent.url) == "https://api.elevenlabs.io/v1/speech-to-text"
    assert sent.headers["xi-api-key"] == GOOD_KEY
    assert b"scribe_v1" in sent.content and b"made-up-recording" in sent.content and b'name="language_code"' in sent.content


def test_openai_gets_language_and_dialect_hint(client: TestClient, auth: dict, provider):
    client.put("/integrations/voice", json={"provider": "openai", "api_key": GOOD_KEY}, headers=auth)
    assert client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO, "language": "ar"}, headers=auth).status_code == 200
    sent = provider[-1]
    assert str(sent.url) == "https://api.openai.com/v1/audio/transcriptions"
    assert b"gpt-4o-transcribe" in sent.content and b'name="prompt"' in sent.content and "السعودية".encode() in sent.content


def test_bad_or_huge_recordings_are_refused(client: TestClient, auth: dict, provider, monkeypatch: pytest.MonkeyPatch):
    client.put("/integrations/voice", json={"provider": "groq", "api_key": GOOD_KEY}, headers=auth)
    calls = len(provider)
    assert client.post("/integrations/voice/transcribe", json={"audio": "!" * 200}, headers=auth).status_code == 422
    from app.routers import integrations

    monkeypatch.setattr(integrations, "MAX_AUDIO_BYTES", 10)
    assert client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO}, headers=auth).status_code == 413
    assert len(provider) == calls


def test_provider_errors_never_look_like_a_signed_out_session(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/voice", json={"provider": "groq", "api_key": GOOD_KEY}, headers=auth)
    row = db.scalar(select(VoiceConnection))
    from app.security import encrypt_secret

    row.api_key = encrypt_secret("revoked-key-0000")
    db.commit()
    response = client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO}, headers=auth)
    assert response.status_code == 409


def test_each_user_has_their_own_voice_model(client: TestClient, auth: dict, provider):
    client.put("/integrations/voice", json={"provider": "groq", "api_key": GOOD_KEY}, headers=auth)
    other = bearer(sign_up(client, email="other@example.com"))
    assert client.get("/integrations/voice", headers=other).json()["connected"] is False
    assert client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO}, headers=other).status_code == 404


def test_disconnect_forgets_the_key(client: TestClient, auth: dict, db: Session, provider):
    client.put("/integrations/voice", json={"provider": "groq", "api_key": GOOD_KEY}, headers=auth)
    assert client.delete("/integrations/voice", headers=auth).status_code == 204
    assert db.scalar(select(VoiceConnection)) is None
    assert client.get("/integrations/voice", headers=auth).json()["connected"] is False


def test_requires_sign_in(client: TestClient):
    assert client.get("/integrations/voice").status_code == 401
    assert client.post("/integrations/voice/transcribe", json={"audio": FAKE_AUDIO}).status_code == 401
