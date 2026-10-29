"""WHOOP: connect with OAuth, sync, numeric summary, and the AI-written summary.

Connecting: the app asks POST /whoop/connect for WHOOP's sign-in URL and opens it in a browser. WHOOP sends the
browser back to GET /whoop/callback, which stores the tokens and redirects to the app (orbit://whoop?status=...).
"""

import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode, urlparse
from zoneinfo import ZoneInfo

import jwt
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select

from app.config import get_settings
from app.deps import Db, UserId
from app.models import Profile, User, WhoopConnection, WhoopCycle, WhoopInsight, WhoopRecovery, WhoopSleep, WhoopWorkout
from app.security import decrypt_secret
from app.services import whoop_ai, whoop_analytics, whoop_api, whoop_sync

router = APIRouter(prefix="/whoop", tags=["whoop"])

STATE_MINUTES = 10
# Claude costs money per call; one summary every couple of minutes is plenty.
INSIGHT_COOLDOWN = timedelta(minutes=2)
# Deep link schemes the callback may send the browser back to, besides the configured app link.
APP_SCHEMES = {"exp", "exps"}
DATA_MODELS = (WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout)


class WhoopStatus(BaseModel):
    configured: bool
    ai_configured: bool
    connected: bool
    last_synced_at: datetime | None = None
    last_sync_error: str | None = None


class ConnectRequest(BaseModel):
    # The app's own deep link, e.g. orbit://whoop or exp://192.168.1.5:8081/--/whoop in Expo Go.
    return_to: str | None = None


class ConnectUrl(BaseModel):
    url: str


class InsightRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    period_start: date
    period_end: date
    summary: str
    highlights: list[str]
    recommendations: list[str]
    model: str
    created_at: datetime


class SyncResult(BaseModel):
    counts: dict[str, int]
    last_synced_at: datetime | None


def _require_configured() -> None:
    if not whoop_api.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "WHOOP isn't set up on this server yet.")


def _return_url(requested: str | None) -> str:
    """Where the browser goes back to. The app may ask for its own deep link (Expo Go uses exp://), but only app
    schemes are allowed, so this can't be turned into a redirect to some website."""
    default = get_settings().whoop_app_redirect
    if not requested:
        return default
    allowed = {urlparse(default).scheme, *APP_SCHEMES}
    if urlparse(requested).scheme not in allowed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "return_to must be a link into the Orbit app.")
    return requested


def _new_state(user_id: uuid.UUID, return_to: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "typ": "whoop_state",
        "iat": now,
        "exp": now + timedelta(minutes=STATE_MINUTES),
        "r": return_to,
        "n": secrets.token_urlsafe(8),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def _read_state(state: str) -> tuple[uuid.UUID, str] | None:
    try:
        payload = jwt.decode(state, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp"]})
        if payload.get("typ") != "whoop_state":
            return None
        return uuid.UUID(payload["sub"]), payload.get("r") or get_settings().whoop_app_redirect
    except (jwt.PyJWTError, ValueError):
        return None


def _back_to_app(result: str, return_to: str | None = None) -> RedirectResponse:
    target = return_to or get_settings().whoop_app_redirect
    separator = "&" if urlparse(target).query else "?"
    return RedirectResponse(f"{target}{separator}{urlencode({'status': result})}", status.HTTP_302_FOUND)


def _user_today(db: Db, user_id: uuid.UUID) -> date:
    profile = db.get(Profile, user_id)
    try:
        zone = ZoneInfo(profile.timezone) if profile and profile.timezone else UTC
    except (KeyError, ValueError):
        zone = UTC
    return datetime.now(zone).date()


def _delete_data(db: Db, user_id: uuid.UUID) -> None:
    for model in (*DATA_MODELS, WhoopInsight):
        db.execute(delete(model).where(model.user_id == user_id))


@router.get("/status", response_model=WhoopStatus)
def whoop_status(user_id: UserId, db: Db):
    connection = db.get(WhoopConnection, user_id)
    return WhoopStatus(
        configured=whoop_api.configured(),
        ai_configured=whoop_ai.ai_configured(),
        connected=connection is not None,
        last_synced_at=connection.last_synced_at if connection else None,
        last_sync_error=connection.last_sync_error if connection else None,
    )


@router.post("/connect", response_model=ConnectUrl)
def connect(user_id: UserId, body: ConnectRequest | None = None):
    """WHOOP's sign-in page for this user. The state ties the answer back to them and expires in 10 minutes."""
    _require_configured()
    return_to = _return_url(body.return_to if body else None)
    return ConnectUrl(url=whoop_api.authorize_url(_new_state(user_id, return_to)))


@router.get("/callback", include_in_schema=False)
def callback(
    db: Db,
    background: BackgroundTasks,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """WHOOP redirects the browser here. No Orbit token on this request: the signed state says who it is."""
    if not whoop_api.configured():
        return _back_to_app("not_configured")
    found = _read_state(state) if state else None
    if found is None or db.get(User, found[0]) is None:
        return _back_to_app("expired")
    user_id, return_to = found
    if error or not code:
        return _back_to_app("denied", return_to)
    try:
        tokens = whoop_api.exchange_code(code)
        whoop_user_id = whoop_api.get(tokens["access_token"], "/v2/user/profile/basic").get("user_id")
    except whoop_api.WhoopError:
        return _back_to_app("error", return_to)

    connection = db.get(WhoopConnection, user_id)
    if connection is None:
        connection = WhoopConnection(user_id=user_id)
        db.add(connection)
    elif connection.whoop_user_id is not None and connection.whoop_user_id != whoop_user_id:
        # A different WHOOP account: don't mix its data with the old one's.
        _delete_data(db, user_id)
        connection.last_synced_at = None
    connection.whoop_user_id = whoop_user_id
    connection.last_sync_error = None
    whoop_sync.save_tokens(connection, tokens)
    db.commit()
    background.add_task(whoop_sync.sync_in_background, user_id)
    return _back_to_app("connected", return_to)


@router.post("/sync", response_model=SyncResult)
def sync_now(user_id: UserId, db: Db):
    _require_configured()
    try:
        counts = whoop_sync.sync_user(db, user_id)
    except whoop_sync.NotConnected as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "WHOOP isn't connected.") from exc
    except whoop_sync.SyncBusy as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "A sync is already running. Try again in a moment.") from exc
    except whoop_api.WhoopAuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "WHOOP needs to be connected again.") from exc
    except whoop_api.WhoopError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    connection = db.get(WhoopConnection, user_id)
    return SyncResult(counts=counts, last_synced_at=connection.last_synced_at if connection else None)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(
    user_id: UserId, db: Db, delete_data: bool = Query(False, description="Also delete the synced WHOOP data and AI summaries.")
):
    connection = db.get(WhoopConnection, user_id)
    if connection is not None:
        access = decrypt_secret(connection.access_token)
        if access:
            whoop_api.revoke(access)
        db.delete(connection)
    if delete_data:
        _delete_data(db, user_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/summary")
def summary(user_id: UserId, db: Db, days: int = Query(30, ge=7, le=180)) -> dict[str, Any]:
    """Daily rows (oldest first), averages, last 7 days against the 7 before, recovery zones and workouts."""
    return whoop_analytics.load_summary(db, user_id, today=_user_today(db, user_id), days=days)


@router.get("/insights/latest", response_model=InsightRow | None)
def latest_insight(user_id: UserId, db: Db):
    return db.scalar(select(WhoopInsight).where(WhoopInsight.user_id == user_id).order_by(WhoopInsight.created_at.desc()).limit(1))


@router.post("/insights", response_model=InsightRow, status_code=status.HTTP_201_CREATED)
def create_insight(user_id: UserId, db: Db, days: int = Query(30, ge=7, le=90)):
    """Asks Claude for a fresh Arabic summary of the last `days` days and keeps it."""
    if not whoop_ai.ai_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The AI summary isn't set up on this server yet.")
    last = latest_insight(user_id, db)
    if last is not None and last.created_at > datetime.now(UTC) - INSIGHT_COOLDOWN:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "A summary was just written. Try again in a couple of minutes.")
    data = whoop_analytics.load_summary(db, user_id, today=_user_today(db, user_id), days=days)
    if not data["has_data"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "No WHOOP data yet. Connect WHOOP and sync first.")
    try:
        insight, model = whoop_ai.write_insight(data)
    except whoop_ai.InsightUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    row = WhoopInsight(
        user_id=user_id,
        period_start=date.fromisoformat(data["start"]),
        period_end=date.fromisoformat(data["end"]),
        summary=insight.summary,
        highlights=insight.highlights,
        recommendations=insight.recommendations,
        model=model,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
