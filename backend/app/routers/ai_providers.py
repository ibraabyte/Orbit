"""The AI companies on the Integrations screen: each one's live model list, and OpenRouter's account sign-in.

POST /integrations/providers/{provider}/models lists the models a key can use, straight from the company. With a key
in the body it tests that key before anything is saved; without one it uses the key this user saved for that company.
Saving still goes through PUT /integrations/ai (text) and PUT /integrations/voice (speech to text).

OpenRouter's account sign-in: POST /integrations/openrouter/start gives the page to open; OpenRouter sends the browser
back to GET /integrations/openrouter/callback/{state}, which trades the code for a key, saves it like a typed key, and
sends the browser back into the app. The signed state says who it is (no Orbit token on that request).
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import urlencode, urlparse

import jwt
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import Db, UserId
from app.models import AiConnection, User, VoiceConnection
from app.security import decrypt_secret, encrypt_secret
from app.services import ai_providers

router = APIRouter(prefix="/integrations", tags=["integrations"])

STATE_MINUTES = 10
# The app's own deep links only (Expo Go uses exp://), so the callback can't be turned into a redirect to a website.
APP_SCHEMES = {"orbit", "exp", "exps"}
DEFAULT_RETURN = "orbit://ai-provider?id=openrouter"
TEXT_PROVIDERS = ("openai", "anthropic", "gemini", "openrouter")


class ModelsIn(BaseModel):
    # Left out: the key this user saved for the company.
    api_key: str | None = Field(default=None, min_length=8, max_length=500)


class ModelOut(BaseModel):
    id: str
    name: str | None = None
    kind: Literal["text", "speech", "realtime"]


class ModelsOut(BaseModel):
    models: list[ModelOut]


class OpenrouterStart(BaseModel):
    # The app's own deep link to come back to, e.g. orbit://ai-provider?id=openrouter.
    return_to: str | None = Field(default=None, max_length=500)


class OpenrouterUrl(BaseModel):
    authorization_url: str


def saved_key(db: Db, user_id: uuid.UUID, provider: str) -> str | None:
    """The key this user saved for one company: as a text AI, else as their voice model."""
    if provider in TEXT_PROVIDERS:
        row = db.get(AiConnection, (user_id, provider))
        key = decrypt_secret(row.api_key) if row else None
        if key:
            return key
    voice = db.get(VoiceConnection, user_id)
    if voice is not None and voice.provider == provider:
        return decrypt_secret(voice.api_key) or None
    return None


@router.post("/providers/{provider}/models", response_model=ModelsOut)
def models(provider: Literal[ai_providers.PROVIDERS], user_id: UserId, db: Db, body: ModelsIn | None = None):  # type: ignore[valid-type]
    """The models this key can use, newest first. Doubles as the key test: nothing is saved here."""
    api_key = (body.api_key or "").strip() if body and body.api_key else saved_key(db, user_id, provider)
    if not api_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Add your API key first.")
    try:
        found = ai_providers.list_models(provider, api_key)
    except ai_providers.ProviderKeyRejected as exc:  # Never 401: the app would take that as "your Orbit session ended".
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ai_providers.ProviderUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return ModelsOut(models=[ModelOut(id=model.id, name=model.name, kind=model.kind) for model in found])


def _return_url(requested: str | None) -> str:
    if not requested:
        return DEFAULT_RETURN
    if urlparse(requested).scheme not in APP_SCHEMES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "return_to must be a link into the Orbit app.")
    return requested


def _new_state(user_id: uuid.UUID, return_to: str) -> tuple[str, str]:
    now = datetime.now(UTC)
    nonce = secrets.token_urlsafe(16)
    payload = {
        "sub": str(user_id),
        "typ": "openrouter_state",
        "iat": now,
        "exp": now + timedelta(minutes=STATE_MINUTES),
        "r": return_to,
        "n": nonce,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256"), nonce


def _read_state(state: str) -> tuple[uuid.UUID, str, str] | None:
    try:
        payload = jwt.decode(state, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp", "n"]})
        if payload.get("typ") != "openrouter_state":
            return None
        return uuid.UUID(payload["sub"]), payload.get("r") or DEFAULT_RETURN, str(payload["n"])
    except (jwt.PyJWTError, ValueError):
        return None


def _back_to_app(return_to: str, result: str) -> RedirectResponse:
    separator = "&" if urlparse(return_to).query else "?"
    return RedirectResponse(f"{return_to}{separator}{urlencode({'status': result})}", status.HTTP_302_FOUND)


@router.post("/openrouter/start", response_model=OpenrouterUrl)
def openrouter_start(request: Request, user_id: UserId, body: OpenrouterStart | None = None):
    """OpenRouter's sign-in page for this user. The state ties the answer back to them and expires in 10 minutes."""
    return_to = _return_url(body.return_to if body else None)
    state, nonce = _new_state(user_id, return_to)
    callback = str(request.url_for("openrouter_callback", state=state))
    challenge = ai_providers.openrouter_challenge(ai_providers.openrouter_verifier(nonce))
    query = urlencode({"callback_url": callback, "code_challenge": challenge, "code_challenge_method": "S256"})
    return OpenrouterUrl(authorization_url=f"{ai_providers.OPENROUTER_AUTH_URL}?{query}")


@router.get("/openrouter/callback/{state}", include_in_schema=False, name="openrouter_callback")
def openrouter_callback(state: str, db: Db, code: str | None = None):
    """OpenRouter sends the browser here with a one-time code. The key it is traded for is kept like a typed key."""
    found = _read_state(state)
    if found is None or db.get(User, found[0]) is None:
        return _back_to_app(DEFAULT_RETURN, "expired")
    user_id, return_to, nonce = found
    if not code:
        return _back_to_app(return_to, "denied")
    try:
        api_key = ai_providers.openrouter_exchange(code, ai_providers.openrouter_verifier(nonce))
    except ai_providers.ProviderUnavailable:
        return _back_to_app(return_to, "error")
    row = db.get(AiConnection, (user_id, "openrouter"))
    if row is None:
        row = AiConnection(user_id=user_id, provider="openrouter", model=ai_providers.OPENROUTER_DEFAULT_MODEL, api_key="")
        db.add(row)
    # A model picked before stays; only the key is new.
    row.api_key = encrypt_secret(api_key)
    db.commit()
    return _back_to_app(return_to, "connected")
