"""Gmail, read only: connect with Google, see the state, disconnect.

The app asks POST /gmail/connect for Google's consent page and opens it in a browser. Google sends the browser back
to GET /gmail/callback, which stores the tokens (encrypted) and redirects to the app (orbit://gmail?status=...).
Features that read mail use app/services/gmail_api.py; this router only manages the link.
"""

import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode, urlparse

import jwt
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import get_settings
from app.deps import Db, UserId
from app.models import GmailConnection, User
from app.security import decrypt_secret
from app.services import gmail_api

router = APIRouter(prefix="/gmail", tags=["gmail"])
log = logging.getLogger("orbit.gmail")

STATE_MINUTES = 10
APP_SCHEMES = {"exp", "exps"}


class GmailStatus(BaseModel):
    configured: bool
    connected: bool
    email: str | None = None
    connected_at: datetime | None = None
    last_error: str | None = None


class ConnectRequest(BaseModel):
    # The app's own deep link, e.g. orbit://gmail or exp://192.168.1.5:8081/--/gmail in Expo Go.
    return_to: str | None = None


class ConnectUrl(BaseModel):
    url: str


def status_of(db: Db, user_id: uuid.UUID) -> GmailStatus:
    connection = db.get(GmailConnection, user_id)
    return GmailStatus(
        configured=gmail_api.configured(),
        connected=connection is not None,
        email=connection.email if connection else None,
        connected_at=connection.created_at if connection else None,
        last_error=connection.last_error if connection else None,
    )


def _return_url(requested: str | None) -> str:
    default = get_settings().gmail_app_redirect
    if not requested:
        return default
    if urlparse(requested).scheme not in {urlparse(default).scheme, *APP_SCHEMES}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "return_to must be a link into the Orbit app.")
    return requested


def _new_state(user_id: uuid.UUID, return_to: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "typ": "gmail_state",
        "iat": now,
        "exp": now + timedelta(minutes=STATE_MINUTES),
        "r": return_to,
        "n": secrets.token_urlsafe(8),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def _read_state(state: str) -> tuple[uuid.UUID, str] | None:
    try:
        payload = jwt.decode(state, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp"]})
        if payload.get("typ") != "gmail_state":
            return None
        return uuid.UUID(payload["sub"]), payload.get("r") or get_settings().gmail_app_redirect
    except (jwt.PyJWTError, ValueError):
        return None


def _back_to_app(result: str, return_to: str | None = None) -> RedirectResponse:
    target = return_to or get_settings().gmail_app_redirect
    separator = "&" if urlparse(target).query else "?"
    return RedirectResponse(f"{target}{separator}{urlencode({'status': result})}", status.HTTP_302_FOUND)


@router.get("/status", response_model=GmailStatus)
def gmail_status(user_id: UserId, db: Db):
    return status_of(db, user_id)


@router.post("/connect", response_model=ConnectUrl)
def connect(user_id: UserId, db: Db, body: ConnectRequest | None = None):
    """Google's consent page for this user. The state ties the answer back to them and expires in 10 minutes."""
    if not gmail_api.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google isn't set up on this server yet.")
    return_to = _return_url(body.return_to if body else None)
    user = db.get(User, user_id)
    return ConnectUrl(url=gmail_api.authorize_url(_new_state(user_id, return_to), login_hint=user.email if user else None))


@router.get("/callback", include_in_schema=False)
def callback(db: Db, code: str | None = None, state: str | None = None, error: str | None = None, scope: str | None = None):
    """Google redirects the browser here. No Orbit token on this request: the signed state says who it is."""
    if not gmail_api.configured():
        return _back_to_app("not_configured")
    found = _read_state(state) if state else None
    if found is None or db.get(User, found[0]) is None:
        return _back_to_app("expired")
    user_id, return_to = found
    if error or not code:
        log.warning("Gmail consent came back with an error: %s", error if error and error.replace("_", "").isalnum() else "no code")
        return _back_to_app("bad_setup" if error in gmail_api.SETUP_ERRORS else "denied", return_to)
    # Google lets people untick a scope on the consent page; without mail reading there is nothing to connect.
    if scope is not None and gmail_api.SCOPE not in scope.split():
        return _back_to_app("no_mail_scope", return_to)
    try:
        tokens = gmail_api.exchange_code(code)
        if gmail_api.SCOPE not in str(tokens.get("scope") or gmail_api.SCOPE).split():
            return _back_to_app("no_mail_scope", return_to)
        if not tokens.get("refresh_token"):
            # Without it the link would die within the hour. Google sends it with prompt=consent, so this is rare.
            return _back_to_app("error", return_to)
        email = gmail_api.profile_email(tokens["access_token"])
    except gmail_api.GmailAuthError as exc:
        return _back_to_app("bad_setup" if exc.code in gmail_api.SETUP_ERRORS else "error", return_to)
    except gmail_api.GmailError as exc:
        log.warning("Gmail connect failed: %s", exc)
        return _back_to_app("api_off" if exc.status == 403 else "error", return_to)

    connection = db.get(GmailConnection, user_id)
    if connection is None:
        connection = GmailConnection(user_id=user_id)
        db.add(connection)
    connection.email = email
    connection.last_error = None
    gmail_api.save_tokens(connection, tokens)
    db.commit()
    return _back_to_app("connected", return_to)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(user_id: UserId, db: Db):
    """Forgets the Gmail link and asks Google to revoke it. What features already found from mail stays."""
    connection = db.get(GmailConnection, user_id)
    if connection is not None:
        token = decrypt_secret(connection.refresh_token) or decrypt_secret(connection.access_token)
        if token:
            gmail_api.revoke(token)
        db.delete(connection)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
