import threading
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import exists, func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import Db, UserId
from app.models import Profile, RefreshToken, User
from app.schemas.auth import ChangePassword, Me, Refresh, SignIn, SignUp, Tokens
from app.security import create_access_token, hash_password, hash_refresh_token, new_refresh_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


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


def _signups_open(db: Session) -> bool:
    return get_settings().allow_signups or not db.scalar(select(exists().where(User.id.isnot(None))))


class AuthStatus(BaseModel):
    signups_open: bool


@router.get("/status", response_model=AuthStatus)
def auth_status(db: Db):
    """Lets the app decide whether to show "Create account". The first account is always allowed."""
    return AuthStatus(signups_open=_signups_open(db))


@router.post("/sign-up", response_model=Tokens, status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUp, db: Db):
    if not _signups_open(db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sign-ups are closed on this server.")
    if _find_user(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(email=body.email, password_hash=hash_password(body.password))
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
    return Me(id=user.id, email=user.email)


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
