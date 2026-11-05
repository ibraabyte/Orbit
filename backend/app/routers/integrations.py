"""Connections each user sets up from the app, for their account only.

GET /integrations is the overview the Integrations screen shows. Seerr: the user saves their server's address and
API key once (PUT), the key is kept encrypted, and the app then goes through /integrations/seerr/api/... so the key
never has to live on the phone. AI: the user picks a provider and saves their own key the same way. WHOOP connects
with its own OAuth flow in app/routers/whoop.py.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import Db, UserId
from app.models import AiConnection, Profile, ServiceConnection, User, WhoopConnection
from app.models.integrations import AI_CHOICES, AI_PROVIDERS
from app.routers.chatgpt import ChatgptStatus
from app.security import decrypt_secret, encrypt_secret
from app.services import chatgpt_auth, seerr, whoop_ai, whoop_api

router = APIRouter(prefix="/integrations", tags=["integrations"])


class WhoopOverview(BaseModel):
    configured: bool
    connected: bool
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None


class SeerrStatus(BaseModel):
    connected: bool
    url: str | None = None
    account_name: str | None = None
    connected_at: datetime | None = None


class AiStatus(BaseModel):
    # configured: this user can get summaries. connected: through their own key, not the admin's server key.
    configured: bool
    connected: bool
    provider: str | None = None
    model: str | None = None
    instructions: str | None = None
    connected_at: datetime | None = None


class AiChoice(BaseModel):
    """One AI this user connected: a provider with their own key, or "chatgpt" (their ChatGPT account)."""

    provider: str
    model: str | None = None
    instructions: str | None = None
    connected_at: datetime | None = None
    is_default: bool


class AiChoices(BaseModel):
    # In the order Orbit falls back through. default: the one used when the app doesn't pick (null: none connected).
    choices: list[AiChoice]
    default: str | None
    # No AI of their own, but the admin's server key still writes summaries for them.
    server_key: bool


class Overview(BaseModel):
    whoop: WhoopOverview
    seerr: SeerrStatus
    # ai: the default API-key connection, kept for app versions from before more than one AI could be connected.
    ai: AiStatus
    ais: AiChoices
    chatgpt: ChatgptStatus


class AiDefault(BaseModel):
    provider: Literal[AI_CHOICES]  # type: ignore[valid-type]


class SeerrConnect(BaseModel):
    url: str = Field(min_length=3, max_length=500)
    api_key: str = Field(min_length=8, max_length=500)


class AiConnect(BaseModel):
    provider: Literal[AI_PROVIDERS]  # type: ignore[valid-type]
    # Empty is fine for Claude only; the other providers' model names change too often for Orbit to pick one.
    model: str | None = Field(default=None, max_length=200)
    # Left out to keep the saved key, when changing only the model or instructions.
    api_key: str | None = Field(default=None, min_length=8, max_length=500)
    instructions: str | None = Field(default=None, max_length=1000)


def _ai_row(db: Session, user_id, provider: str | None = None) -> AiConnection | None:
    """This provider's row, or with none named the default key (or the oldest one when the default is ChatGPT)."""
    if provider is None:
        default = whoop_ai.default_choice(db, user_id)
        provider = default if default != "chatgpt" else None
    if provider is not None:
        return db.get(AiConnection, (user_id, provider))
    return db.scalar(select(AiConnection).where(AiConnection.user_id == user_id).order_by(AiConnection.created_at).limit(1))


def _ai_status(db: Session, user_id, provider: str | None = None) -> AiStatus:
    configured = whoop_ai.access_for(db, user_id) is not None
    row = _ai_row(db, user_id, provider)
    if row is None:
        return AiStatus(configured=configured, connected=False)
    return AiStatus(
        configured=configured,
        connected=True,
        provider=row.provider,
        model=row.model,
        instructions=row.instructions,
        connected_at=row.created_at,
    )


def _ai_choices(db: Session, user_id) -> AiChoices:
    default = whoop_ai.default_choice(db, user_id)
    rows = {row.provider: row for row in db.scalars(select(AiConnection).where(AiConnection.user_id == user_id))}
    choices = []
    for provider in whoop_ai.connected(db, user_id):
        row = rows.get(provider)
        choices.append(
            AiChoice(
                provider=provider,
                model=row.model if row else None,
                instructions=row.instructions if row else None,
                connected_at=row.created_at if row else None,
                is_default=provider == default,
            )
        )
    server_key = default is None and whoop_ai.access_for(db, user_id) is not None
    return AiChoices(choices=choices, default=default, server_key=server_key)


def _seerr_row(db: Session, user_id) -> ServiceConnection | None:
    return db.get(ServiceConnection, (user_id, "seerr"))


def _seerr_status(row: ServiceConnection | None) -> SeerrStatus:
    if row is None:
        return SeerrStatus(connected=False)
    return SeerrStatus(connected=True, url=row.url, account_name=row.account_name, connected_at=row.created_at)


def _is_admin(db: Session, user_id) -> bool:
    return db.get(User, user_id).is_admin


def _seerr_failure(exc: seerr.SeerrError) -> HTTPException:
    # Never 401: the app would take that as "your Orbit session ended".
    if isinstance(exc, seerr.BadAddress):
        return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))
    if isinstance(exc, seerr.SeerrKeyRejected):
        return HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))


@router.get("", response_model=Overview)
def overview(user_id: UserId, db: Db):
    whoop = db.get(WhoopConnection, user_id)
    return Overview(
        whoop=WhoopOverview(
            configured=whoop_api.configured(),
            connected=whoop is not None,
            last_synced_at=whoop.last_synced_at if whoop else None,
            last_sync_error=whoop.last_sync_error if whoop else None,
        ),
        seerr=_seerr_status(_seerr_row(db, user_id)),
        ai=_ai_status(db, user_id),
        ais=_ai_choices(db, user_id),
        chatgpt=ChatgptStatus(status=chatgpt_auth.connection_status(db, user_id)),
    )


@router.get("/ai", response_model=AiStatus)
def ai_status(user_id: UserId, db: Db):
    return _ai_status(db, user_id)


@router.get("/ais", response_model=AiChoices)
def ai_choices(user_id: UserId, db: Db):
    return _ai_choices(db, user_id)


@router.put("/ai/default", response_model=AiChoices)
def set_ai_default(body: AiDefault, user_id: UserId, db: Db):
    """Which connected AI Orbit uses when the app doesn't pick one."""
    if body.provider not in whoop_ai.connected(db, user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect that AI first.")
    profile = db.get(Profile, user_id)
    if profile is None:
        profile = Profile(id=user_id)
        db.add(profile)
    profile.ai_default = body.provider
    db.commit()
    return _ai_choices(db, user_id)


@router.put("/ai", response_model=AiStatus)
def connect_ai(body: AiConnect, user_id: UserId, db: Db):
    """Checks the key and model with the provider, then saves them for this user only. Each provider has its own
    row, so connecting a second provider keeps the first."""
    row = db.get(AiConnection, (user_id, body.provider))
    model = (body.model or "").strip() or (get_settings().insights_model if body.provider == "anthropic" else "")
    if not model:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter the model name from your AI provider.")
    new_key = (body.api_key or "").strip()
    # A saved key stays with its provider (its own row): never send one company's key to another.
    api_key = new_key or (decrypt_secret(row.api_key) if row else None)
    if not api_key:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter your API key.")
    if new_key or row is None or row.model != model:
        try:
            whoop_ai.check_access(whoop_ai.AiAccess(body.provider, model, api_key))
        except whoop_ai.AiKeyRejected as exc:  # Never 401: the app would take that as "your Orbit session ended".
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        except whoop_ai.InsightUnavailable as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    if row is None:
        row = AiConnection(user_id=user_id, provider=body.provider, model=model, api_key="")
        db.add(row)
    row.provider = body.provider
    row.model = model
    row.api_key = encrypt_secret(api_key)
    row.instructions = (body.instructions or "").strip() or None
    db.commit()
    db.refresh(row)
    return _ai_status(db, user_id, body.provider)


@router.delete("/ai", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_ai(user_id: UserId, db: Db):
    """Forgets every saved AI key (what "Disconnect AI" meant when there could be only one)."""
    db.execute(delete(AiConnection).where(AiConnection.user_id == user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/ai/{provider}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_one_ai(provider: Literal[AI_PROVIDERS], user_id: UserId, db: Db):  # type: ignore[valid-type]
    """Forgets one provider's key. If it was the default, the next connected AI takes over."""
    db.execute(delete(AiConnection).where(AiConnection.user_id == user_id, AiConnection.provider == provider))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/seerr", response_model=SeerrStatus)
def seerr_status(user_id: UserId, db: Db):
    return _seerr_status(_seerr_row(db, user_id))


@router.put("/seerr", response_model=SeerrStatus)
def connect_seerr(body: SeerrConnect, user_id: UserId, db: Db):
    """Checks the address and key against the Seerr server, then saves them for this user only."""
    try:
        url = seerr.normalize_url(body.url)
        api_key = body.api_key.strip()
        _, me = seerr.call(url, api_key, "GET", "auth/me", allow_private=_is_admin(db, user_id))
    except seerr.SeerrError as exc:
        raise _seerr_failure(exc) from exc
    if not isinstance(me, dict) or "permissions" not in me:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "That server didn't answer like Seerr does.")
    name = me.get("displayName") or me.get("username") or me.get("email")
    row = _seerr_row(db, user_id)
    if row is None:
        row = ServiceConnection(user_id=user_id, provider="seerr", url=url, api_key="")
        db.add(row)
    row.url = url
    row.api_key = encrypt_secret(api_key)
    row.account_name = str(name)[:200] if name else None
    db.commit()
    db.refresh(row)
    return _seerr_status(row)


@router.delete("/seerr", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_seerr(user_id: UserId, db: Db):
    row = _seerr_row(db, user_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.api_route("/seerr/api/{path:path}", methods=["GET", "POST", "DELETE"], include_in_schema=False)
def seerr_proxy(path: str, request: Request, user_id: UserId, db: Db, body: Annotated[dict[str, Any] | None, Body()] = None) -> Any:
    """The app's Seerr calls (search, trending, requests, approve...), sent on with this user's saved key."""
    method = request.method
    if not seerr.allowed(method, path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a Seerr call Orbit makes.")
    row = _seerr_row(db, user_id)
    api_key = decrypt_secret(row.api_key) if row else None
    if row is None or api_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seerr isn't connected.")
    try:
        code, data = seerr.call(
            row.url,
            api_key,
            method,
            path,
            params=list(request.query_params.multi_items()),
            json=body if method == "POST" else None,
            allow_private=_is_admin(db, user_id),
        )
    except seerr.SeerrError as exc:
        raise _seerr_failure(exc) from exc
    if code == 204 or data is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    if code >= 400:
        message = data.get("message") if isinstance(data, dict) else None
        detail = f"Seerr: {message}" if message else f"Seerr error {code}."
        return JSONResponse({"detail": detail}, status_code=code if code < 500 else status.HTTP_502_BAD_GATEWAY)
    return JSONResponse(data, status_code=code)
