import base64
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

_hasher = PasswordHasher()
# Verified against when the email is unknown, so a miss costs the same time as a wrong password.
_dummy_hash = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _dummy_hash, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> tuple[str, int]:
    settings = get_settings()
    now = now or datetime.now(UTC)
    expires_in = settings.access_token_minutes * 60
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(seconds=expires_in), "typ": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256"), expires_in


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], options={"require": ["sub", "exp"]})
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":
        return None
    try:
        return uuid.UUID(payload["sub"])
    except ValueError:
        return None


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    # Refresh tokens are long random strings, so a fast hash is enough; it keeps a DB leak from handing out sessions.
    return hashlib.sha256(token.encode()).hexdigest()


def _fernet() -> Fernet:
    # Derived from the signing secret so production needs no extra key. Rotating that secret means reconnecting WHOOP.
    digest = hashlib.sha256(b"orbit:stored-secrets:" + get_settings().jwt_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    """For third-party tokens (WHOOP) at rest: a database dump alone doesn't hand them out."""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None
