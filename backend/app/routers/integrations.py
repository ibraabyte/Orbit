"""Connections each user sets up from the app, for their account only.

GET /integrations is the overview the Integrations screen shows. Seerr: the user saves their server's address and
API key once (PUT), the key is kept encrypted, and the app then goes through /integrations/seerr/api/... so the key
never has to live on the phone. WHOOP connects with its own OAuth flow in app/routers/whoop.py.
"""

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.deps import Db, UserId
from app.models import ServiceConnection, User, WhoopConnection
from app.security import decrypt_secret, encrypt_secret
from app.services import seerr, whoop_ai, whoop_api

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


class AiOverview(BaseModel):
    configured: bool


class Overview(BaseModel):
    whoop: WhoopOverview
    seerr: SeerrStatus
    ai: AiOverview


class SeerrConnect(BaseModel):
    url: str = Field(min_length=3, max_length=500)
    api_key: str = Field(min_length=8, max_length=500)


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
        ai=AiOverview(configured=whoop_ai.ai_configured()),
    )


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
