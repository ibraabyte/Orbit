import secrets
import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode, urlparse

import jwt
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import exists, func, select, text, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import Db, UserId
from app.models import Profile, RefreshToken, User
from app.routers.admin import load as load_server_settings
from app.routers.whoop import APP_SCHEMES
from app.schemas.auth import ChangePassword, GoogleFinish, GoogleStart, GoogleStarted, Me, Refresh, SignIn, SignUp, Tokens
from app.security import create_access_token, hash_password, hash_refresh_token, new_refresh_token, verify_password
from app.services import google_api

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_STATE_MINUTES = 10
GOOGLE_CODE_MINUTES = 2


class _Throttle:
    """Counts failed sign-ins per email in memory. Enough for one API process on a personal server."""

    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: str, window: float) -> deque[float]:
        failures = self._failures[key]
        while failures and failures[0] < time.monotonic() - window:
            failures.popleft()
        return failures

    def blocked(self, key: str) -> bool:
        settings = get_settings()
        with self._lock:
            return len(self._recent(key, settings.login_window_minutes * 60)) >= settings.login_attempts

    def fail(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


throttle = _Throttle()


def _issue(db: Session, user_id: uuid.UUID, device: str | None, family_id: uuid.UUID | None = None) -> Tokens:
    refresh = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            family_id=family_id or uuid.uuid4(),
            token_hash=hash_refresh_token(refresh),
            device=device,
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
        )
    )
    db.commit()
    access, expires_in = create_access_token(user_id)
    return Tokens(access_token=access, refresh_token=refresh, expires_in=expires_in, user_id=user_id)


def _revoke(db: Session, *conditions) -> None:
    db.execute(update(RefreshToken).where(*conditions, RefreshToken.revoked_at.is_(None)).values(revoked_at=func.now()))


def _find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def _has_users(db: Session) -> bool:
    return bool(db.scalar(select(exists().where(User.id.isnot(None)))))


def _signups_open(db: Session) -> bool:
    """The first account is always allowed. After that, the admin's switch in the app decides
    (ORBIT_ALLOW_SIGNUPS=true on the server also opens them, for whoever runs Orbit without the app)."""
    return get_settings().allow_signups or load_server_settings(db).signups_open or not _has_users(db)


class AuthStatus(BaseModel):
    signups_open: bool
    google: bool


@router.get("/status", response_model=AuthStatus)
def auth_status(db: Db):
    """Lets the app decide whether to show "Create account" and "Continue with Google"."""
    return AuthStatus(signups_open=_signups_open(db), google=google_api.configured())


@router.post("/sign-up", response_model=Tokens, status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUp, db: Db):
    # One sign-up at a time, so two people racing for the first account can't both become admin.
    db.execute(text("select pg_advisory_xact_lock(hashtext('orbit:sign-up'))"))
    if not _signups_open(db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sign-ups are closed on this server.")
    if _find_user(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    # The first account runs the server: it can open sign-ups and reach private network addresses.
    user = User(email=body.email, password_hash=hash_password(body.password), is_admin=not _has_users(db))
    db.add(user)
    db.flush()
    # Supabase did this with the handle_new_user trigger.
    db.add(Profile(id=user.id, display_name=body.display_name or body.email.split("@")[0], timezone=body.timezone))
    db.commit()
    return _issue(db, user.id, body.device)


@router.post("/sign-in", response_model=Tokens)
def sign_in(body: SignIn, db: Db):
    key = body.email.lower()
    if throttle.blocked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Try again in a few minutes.")
    user = _find_user(db, body.email)
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        throttle.fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    throttle.clear(key)
    return _issue(db, user.id, body.device)


def _sign(kind: str, minutes: int, **claims: Any) -> str:
    now = datetime.now(UTC)
    payload = {"typ": kind, "iat": now, "exp": now + timedelta(minutes=minutes), **claims}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def _unsign(token: str, kind: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None
    return payload if payload.get("typ") == kind else None


def _back_to_app(result: str, return_to: str | None = None, **extra: str) -> RedirectResponse:
    target = return_to or get_settings().google_app_redirect
    separator = "&" if urlparse(target).query else "?"
    return RedirectResponse(f"{target}{separator}{urlencode({'status': result, **extra})}", status.HTTP_302_FOUND)


@router.post("/google/start", response_model=GoogleStarted)
def google_start(body: GoogleStart):
    """Google's sign-in page, plus a secret the app keeps. The browser never sees the secret, so a sign-in code
    that leaks from the deep link, or one an attacker plants on someone's phone, is useless on its own."""
    if not google_api.configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in isn't set up on this server yet.")
    return_to = body.return_to or get_settings().google_app_redirect
    # Only app links, so this can't be turned into a redirect to some website.
    if urlparse(return_to).scheme not in {urlparse(get_settings().google_app_redirect).scheme, *APP_SCHEMES}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "return_to must be a link into the Orbit app.")
    secret = secrets.token_urlsafe(32)
    state = _sign("google_state", GOOGLE_STATE_MINUTES, r=return_to, tz=body.timezone, h=hash_refresh_token(secret))
    return GoogleStarted(url=google_api.authorize_url(state), secret=secret)


@router.get("/google/callback", include_in_schema=False)
def google_callback(db: Db, code: str | None = None, state: str | None = None, error: str | None = None):
    """Google redirects the browser here. The signed state says this sign-in began at /google/start."""
    started = _unsign(state, "google_state") if state else None
    if started is None:
        return _back_to_app("expired")
    return_to = started["r"]
    if error or not code:
        return _back_to_app("denied", return_to)
    try:
        identity = google_api.fetch_identity(code)
    except google_api.GoogleError:
        return _back_to_app("error", return_to)
    # An existing account is matched by email below, so the email must really be this person's.
    if identity.get("email_verified") is not True:
        return _back_to_app("unverified", return_to)

    # One at a time, same as sign-up: two people racing for the first account can't both become admin.
    db.execute(text("select pg_advisory_xact_lock(hashtext('orbit:sign-up'))"))
    user = db.scalar(select(User).where(User.google_sub == identity["sub"])) or _find_user(db, identity["email"])
    if user is None:
        if not _signups_open(db):
            return _back_to_app("closed", return_to)
        # A random password nobody knows: this account signs in with Google only.
        user = User(
            email=identity["email"],
            password_hash=hash_password(secrets.token_urlsafe(32)),
            google_sub=identity["sub"],
            is_admin=not _has_users(db),
        )
        db.add(user)
        db.flush()
        name = identity.get("name") or identity["email"].split("@")[0]
        db.add(Profile(id=user.id, display_name=name[:120], timezone=started["tz"]))
    elif user.google_sub is None:
        user.google_sub = identity["sub"]
    elif user.google_sub != identity["sub"]:
        # Same email, different Google account (a reassigned work address, say). Not the same person.
        return _back_to_app("error", return_to)
    db.commit()
    login_code = _sign("google_login", GOOGLE_CODE_MINUTES, sub=str(user.id), h=started["h"])
    return _back_to_app("ok", return_to, code=login_code)


@router.post("/google/finish", response_model=Tokens)
def google_finish(body: GoogleFinish, db: Db):
    """The app trades the code from the deep link, and the secret from /google/start, for a session."""
    login = _unsign(body.code, "google_login")
    if login is None or not secrets.compare_digest(login["h"], hash_refresh_token(body.secret)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in expired. Try again.")
    user = db.get(User, uuid.UUID(login["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in expired. Try again.")
    return _issue(db, user.id, body.device)


@router.post("/refresh", response_model=Tokens)
def refresh(body: Refresh, db: Db):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(body.refresh_token)).with_for_update())
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired. Sign in again.")
    if token is None:
        raise invalid
    if token.used_at is not None or token.revoked_at is not None:
        # An old token came back: someone else may hold this session. End all of it.
        _revoke(db, RefreshToken.family_id == token.family_id)
        db.commit()
        raise invalid
    if token.expires_at <= datetime.now(UTC):
        raise invalid
    token.used_at = datetime.now(UTC)
    return _issue(db, token.user_id, token.device, token.family_id)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(body: Refresh, db: Db):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(body.refresh_token)))
    if token:
        _revoke(db, RefreshToken.family_id == token.family_id)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sign-out-everywhere", status_code=status.HTTP_204_NO_CONTENT)
def sign_out_everywhere(user_id: UserId, db: Db):
    _revoke(db, RefreshToken.user_id == user_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=Me)
def me(user_id: UserId, db: Db):
    user = db.get(User, user_id)
    return Me(id=user.id, email=user.email, is_admin=user.is_admin)


@router.post("/password", response_model=Tokens)
def change_password(body: ChangePassword, user_id: UserId, db: Db):
    """Changing the password signs out every other device and returns a fresh session for this one."""
    user = db.get(User, user_id)
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is wrong.")
    user.password_hash = hash_password(body.new_password)
    _revoke(db, RefreshToken.user_id == user_id)
    db.commit()
    return _issue(db, user_id, None)


class DeleteAccount(BaseModel):
    password: str


@router.post("/delete-account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(body: DeleteAccount, user_id: UserId, db: Db):
    """Deletes the account and, through cascades, every row it owns."""
    user = db.get(User, user_id)
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Password is wrong.")
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
