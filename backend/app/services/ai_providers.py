"""The AI companies a user can connect, and the models each one offers them right now.

The Integrations screen lists one card per company. Inside a company the user saves their key, tests it, and picks a
model from the list the company itself returns for that key (GET .../models), so a model that comes out tomorrow shows
up without an app update. Listing models is free at every provider here, which makes it the key test too.

Where each key is kept is unchanged: the text AIs in ai_connections (one per provider), the speech-to-text model in
voice_connections (one per user). This module only reads keys it is handed.

OpenRouter can also be connected with the user's OpenRouter account (OAuth with PKCE): OpenRouter makes a key for
Orbit and hands it over once; it is then kept like a typed key.
"""

import base64
import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Literal

import httpx2 as httpx

from app.config import get_settings

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None

PROVIDERS = ("openai", "anthropic", "gemini", "openrouter", "groq", "elevenlabs")
NAMES = {
    "openai": "OpenAI",
    "anthropic": "Claude",
    "gemini": "Gemini",
    "openrouter": "OpenRouter",
    "groq": "Groq",
    "elevenlabs": "ElevenLabs",
}
Kind = Literal["text", "speech", "realtime"]

# ponytail: fixed addresses only, so no user-supplied host reaches the server's own network.
_MODELS_URLS = {
    "openai": "https://api.openai.com/v1/models",
    "anthropic": "https://api.anthropic.com/v1/models?limit=1000",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/models",
    "openrouter": "https://openrouter.ai/api/v1/models",
    "groq": "https://api.groq.com/openai/v1/models",
    "elevenlabs": "https://api.elevenlabs.io/v1/models",
}
# OpenRouter's model list is public, so the key is checked on its own.
_OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"
# ElevenLabs lists its voice (text to speech) models only; its speech-to-text models are these.
ELEVENLABS_SPEECH = ("scribe_v1",)

OPENROUTER_AUTH_URL = "https://openrouter.ai/auth"
OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys"
# What an account sign-in starts with until the user picks a model: OpenRouter's own router picks one per request.
OPENROUTER_DEFAULT_MODEL = "openrouter/auto"

# Not chat models, by name: images, embeddings, moderation, the old completion models...
_OPENAI_NOT_TEXT = (
    "audio",
    "realtime",
    "tts",
    "transcribe",
    "image",
    "embedding",
    "moderation",
    "search",
    "instruct",
    "dall-e",
    "whisper",
    "davinci",
    "babbage",
    "sora",
)
_GEMINI_NOT_TEXT = ("embedding", "aqa", "imagen", "tts", "veo", "image", "live")


class ProviderUnavailable(Exception):
    """The company couldn't be reached or answered with an error. The message is safe to show."""


class ProviderKeyRejected(ProviderUnavailable):
    pass


@dataclass(frozen=True)
class ModelInfo:
    id: str
    name: str | None
    kind: Kind
    # Seconds since 1970, when the company says; newest first in the list.
    created: int | None = None


def _get(provider: str, url: str, headers: dict[str, str]) -> Any:
    name = NAMES[provider]
    try:
        with httpx.Client(transport=transport, timeout=30.0) as client:
            response = client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise ProviderUnavailable(f"Can't reach {name} from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise ProviderKeyRejected(f"{name} refused this API key.")
    if response.status_code == 429:
        raise ProviderUnavailable(f"{name} is busy right now. Try again in a minute.")
    if response.status_code != 200:
        raise ProviderUnavailable(f"{name} answered with an error ({response.status_code}). Try again later.")
    try:
        return response.json()
    except ValueError as exc:
        raise ProviderUnavailable(f"{name} sent an answer Orbit can't read.") from exc


def _headers(provider: str, api_key: str) -> dict[str, str]:
    if provider == "anthropic":
        return {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    if provider == "elevenlabs":
        return {"xi-api-key": api_key}
    return {"Authorization": f"Bearer {api_key}"}


def _openai_kind(model_id: str) -> Kind | None:
    lowered = model_id.lower()
    if "realtime" in lowered:
        return "realtime"
    if "transcribe" in lowered or lowered.startswith("whisper"):
        return "speech"
    if lowered.startswith(("gpt-", "chatgpt-", "o1", "o3", "o4", "o5")) and not any(word in lowered for word in _OPENAI_NOT_TEXT):
        return "text"
    return None


def _created(value: Any) -> int | None:
    return int(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _rows(answer: Any) -> list[dict[str, Any]]:
    rows = answer.get("data") if isinstance(answer, dict) else answer
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _classify(provider: str, answer: Any) -> list[ModelInfo]:
    found: list[ModelInfo] = []
    if provider == "elevenlabs":
        # The answer only proves the key works; speech to text is Scribe.
        return [ModelInfo(model, "Scribe", "speech") for model in ELEVENLABS_SPEECH]
    for row in _rows(answer):
        model_id = str(row.get("id") or row.get("model_id") or "").strip()
        if not model_id:
            continue
        if provider == "openai":
            kind = _openai_kind(model_id)
        elif provider == "groq":
            kind = "speech" if "whisper" in model_id.lower() else None
        elif provider == "gemini":
            model_id = model_id.removeprefix("models/")
            lowered = model_id.lower()
            kind = "text" if "gemini" in lowered and not any(word in lowered for word in _GEMINI_NOT_TEXT) else None
        elif provider == "openrouter":
            outputs = (row.get("architecture") or {}).get("output_modalities") if isinstance(row.get("architecture"), dict) else None
            kind = "text" if not outputs or "text" in outputs else None
        else:  # anthropic: every model is a chat model
            kind = "text"
        if kind is None:
            continue
        name = row.get("display_name") or row.get("name")
        created = _created(row.get("created"))
        found.append(ModelInfo(model_id, str(name) if name and name != model_id else None, kind, created))
    if provider == "anthropic":
        # Anthropic sends created_at as a date and already lists the newest first.
        return found
    return sorted(found, key=lambda model: (-(model.created or 0), model.id))


def list_models(provider: str, api_key: str) -> list[ModelInfo]:
    """The models this key can use at this company, newest first. Raises ProviderKeyRejected for a bad key."""
    if provider == "openrouter":
        _get(provider, _OPENROUTER_KEY_URL, _headers(provider, api_key))
    answer = _get(provider, _MODELS_URLS[provider], _headers(provider, api_key))
    return _classify(provider, answer)


# --- OpenRouter account sign-in (OAuth PKCE) ---


def openrouter_verifier(nonce: str) -> str:
    """The PKCE verifier for one sign-in, made again from the state's nonce so it is never stored or sent anywhere."""
    digest = hmac.new(get_settings().jwt_secret.encode(), f"openrouter-pkce:{nonce}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def openrouter_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


def openrouter_exchange(code: str, verifier: str) -> str:
    """Trades the code OpenRouter sent back for the key it made for Orbit."""
    try:
        with httpx.Client(transport=transport, timeout=30.0) as client:
            response = client.post(OPENROUTER_KEYS_URL, json={"code": code, "code_verifier": verifier, "code_challenge_method": "S256"})
    except httpx.HTTPError as exc:
        raise ProviderUnavailable("Can't reach OpenRouter from the server. Try again later.") from exc
    if response.status_code != 200:
        raise ProviderKeyRejected("OpenRouter didn't accept this sign-in. Try again.")
    try:
        key = response.json().get("key")
    except (ValueError, AttributeError) as exc:
        raise ProviderUnavailable("OpenRouter sent an answer Orbit can't read.") from exc
    if not isinstance(key, str) or len(key) < 8:
        raise ProviderUnavailable("OpenRouter sent an answer Orbit can't read.")
    return key
