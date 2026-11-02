"""ChatGPT PKCE sign-in and token renewal. Credentials never leave the server."""

import base64
import hashlib
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx2 as httpx
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatgptConnection
from app.security import decrypt_secret, encrypt_secret

AUTH_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL = "https://auth.openai.com/oauth/token"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
REDIRECT_URI = "http://localhost:1455/auth/callback"
ACCOUNT_CLAIM = "https://api.openai.com/auth"
EXPIRED_MESSAGE = "انتهى ربط ChatGPT. أعد تسجيل الدخول بـChatGPT من الإعدادات."
transport: httpx.BaseTransport | None = None


class ChatgptError(Exception):
    """Only safe, fixed messages belong in this exception."""


class ChatgptExpired(ChatgptError):
    pass


@dataclass(frozen=True, repr=False)
class Credentials:
    access_token: str
    refresh_token: str
    id_token: str
    account_id: str
    expires_at: datetime


def _locked_row(db: Session, user_id: uuid.UUID) -> ChatgptConnection | None:
    # Refresh from the database after acquiring the lock: another request may already have renewed the token.
    return db.scalar(
        select(ChatgptConnection).where(ChatgptConnection.user_id == user_id).with_for_update().execution_options(populate_existing=True)
    )


def _clear_pending(row: ChatgptConnection) -> None:
    row.state = None
    row.verifier = None
    row.pending_expires_at = None


def mark_expired(db: Session, user_id: uuid.UUID, *, expire_pending: bool = False) -> None:
    row = _locked_row(db, user_id)
    pending_due = row is not None and row.status == "pending" and (
        row.pending_expires_at is None or row.pending_expires_at <= datetime.now(UTC)
    )
    # A rejected AI request may predate a fresh sign-in: it must not erase that pending flow.
    if row is not None and (row.status == "connected" or (expire_pending and pending_due)):
        row.status = "expired"
        row.credentials = None
        _clear_pending(row)
    db.commit()


def connection_status(db: Session, user_id: uuid.UUID) -> str:
    row = db.get(ChatgptConnection, user_id)
    if row is None:
        return "not_connected"
    if row.status == "pending" and (row.pending_expires_at is None or row.pending_expires_at <= datetime.now(UTC)):
        mark_expired(db, user_id, expire_pending=True)
        return row.status
    return row.status


def start_login(db: Session, user_id: uuid.UUID) -> str:
    verifier = secrets.token_urlsafe(64)
    state = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    row = _locked_row(db, user_id)
    if row is None:
        row = ChatgptConnection(user_id=user_id, status="pending")
        db.add(row)
    row.status = "pending"
    row.verifier = encrypt_secret(verifier)
    row.state = encrypt_secret(state)
    row.pending_expires_at = datetime.now(UTC) + timedelta(minutes=10)
    db.commit()
    query = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": "openid profile email offline_access",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
        "originator": "codex_cli_rs",
    }
    return f"{AUTH_URL}?{urlencode(query)}"


def parse_callback(callback_url: str) -> tuple[str, str]:
    try:
        parsed = urlsplit(callback_url.strip())
        if parsed.scheme != "http" or parsed.netloc != "localhost:1455" or parsed.path != "/auth/callback" or parsed.fragment:
            raise ValueError
        query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True, max_num_fields=20)
        if "error" in query or len(query.get("code", [])) != 1 or len(query.get("state", [])) != 1:
            raise ValueError
        code, state = query["code"][0], query["state"][0]
        if not code or not state:
            raise ValueError
        return code, state
    except ValueError as exc:
        raise ChatgptError("الصق عنوان صفحة localhost كاملًا كما ظهر بعد تسجيل الدخول.") from exc


def _account_id(*tokens: str) -> str | None:
    for token in tokens:
        try:
            # These tokens come directly from OpenAI over TLS, never from the pasted callback or the app.
            payload = jwt.decode(token, options={"verify_signature": False})
            auth = payload.get(ACCOUNT_CLAIM, {})
            if isinstance(auth, dict):
                account = auth.get("chatgpt_account_id") or auth.get("user_id")
                if isinstance(account, str) and account:
                    return account
        except (jwt.PyJWTError, ValueError, TypeError):
            continue
    return None


def _tokens(form: dict[str, str], previous: Credentials | None = None) -> Credentials:
    try:
        with httpx.Client(transport=transport, timeout=30.0) as client:
            response = client.post(TOKEN_URL, data={"client_id": CLIENT_ID, **form})
        if response.status_code != 200:
            raise ValueError
        body = response.json()
        access = body["access_token"]
        refresh = body.get("refresh_token") or (previous.refresh_token if previous else None)
        identity = body.get("id_token") or (previous.id_token if previous else None)
        if not all(isinstance(value, str) and value for value in (access, refresh, identity)):
            raise ValueError
        account = _account_id(access, identity) or (previous.account_id if previous else None)
        seconds = float(body["expires_in"])
        if not account or not 0 < seconds < 365 * 86400:
            raise ValueError
        return Credentials(access, refresh, identity, account, datetime.now(UTC) + timedelta(seconds=seconds))
    except (httpx.HTTPError, ValueError, KeyError, TypeError, OverflowError) as exc:
        raise ChatgptError("تعذّر إتمام ربط ChatGPT. ابدأ تسجيل الدخول مرة أخرى.") from exc


def exchange_code(code: str, verifier: str) -> Credentials:
    return _tokens({"grant_type": "authorization_code", "code": code, "code_verifier": verifier, "redirect_uri": REDIRECT_URI})


def _save(row: ChatgptConnection, credentials: Credentials) -> None:
    row.credentials = encrypt_secret(json.dumps({
        "access_token": credentials.access_token,
        "refresh_token": credentials.refresh_token,
        "id_token": credentials.id_token,
        "account_id": credentials.account_id,
        "expires_at": credentials.expires_at.isoformat(),
    }))
    row.status = "connected"


def finish_login(db: Session, user_id: uuid.UUID, callback_url: str) -> None:
    code, state = parse_callback(callback_url)
    row = _locked_row(db, user_id)
    if row is None or row.status != "pending":
        db.commit()
        raise ChatgptExpired("ابدأ تسجيل الدخول بـChatGPT أولًا.")
    if row.pending_expires_at is None or row.pending_expires_at <= datetime.now(UTC):
        mark_expired(db, user_id, expire_pending=True)
        raise ChatgptExpired(EXPIRED_MESSAGE)
    expected_state = decrypt_secret(row.state) if row.state else None
    verifier = decrypt_secret(row.verifier) if row.verifier else None
    if not expected_state or not verifier or not secrets.compare_digest(state.encode(), expected_state.encode()):
        db.commit()
        raise ChatgptError("عنوان العودة لا يطابق طلب الربط الحالي. ابدأ الربط من جديد.")
    _clear_pending(row)
    try:
        credentials = exchange_code(code, verifier)
    except ChatgptError:
        row.status = "expired"
        row.credentials = None
        db.commit()
        raise
    _save(row, credentials)
    db.commit()


def get_credentials(db: Session, user_id: uuid.UUID, force_refresh: bool = False) -> Credentials:
    row = _locked_row(db, user_id)
    if row is None or row.status != "connected":
        db.commit()
        raise ChatgptExpired(EXPIRED_MESSAGE)
    try:
        if not row.credentials:
            raise ValueError
        bundle = json.loads(decrypt_secret(row.credentials) or "")
        credentials = Credentials(
            bundle["access_token"], bundle["refresh_token"], bundle["id_token"], bundle["account_id"],
            datetime.fromisoformat(bundle["expires_at"]),
        )
        if force_refresh or credentials.expires_at <= datetime.now(UTC) + timedelta(seconds=60):
            credentials = _tokens({"grant_type": "refresh_token", "refresh_token": credentials.refresh_token}, previous=credentials)
            _save(row, credentials)
    except (ChatgptError, ValueError, KeyError, TypeError) as exc:
        mark_expired(db, user_id)
        raise ChatgptExpired(EXPIRED_MESSAGE) from exc
    db.commit()
    return credentials
