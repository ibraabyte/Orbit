"""Read-only Gmail for one user: connect with Google OAuth, keep the token fresh, search mail and read its headers.

It reuses the Google sign-in client (ORBIT_GOOGLE_CLIENT_ID / _SECRET): no new keys. The redirect URL is the sign-in
one's server with the path /gmail/callback, unless ORBIT_GMAIL_REDIRECT_URI says otherwise. That URL must be listed
in the Google client's "Authorized redirect URIs", the Gmail API must be on, and gmail.readonly must be on the
consent screen.

Only the gmail.readonly scope is asked for: Orbit can never send, delete or change mail. Features read mail through
search() and message() here, and keep only what they need (a sender, a subject line, an amount, a tracking number),
never whole emails. The order tracker reads an email's text with message_with_text() to find the tracking number in it;
the text stays in memory and only the number is kept.
"""

import base64
import binascii
import html as html_lib
import logging
import re
import uuid
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx2 as httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GmailConnection
from app.security import decrypt_secret, encrypt_secret
from app.services import google_api

AUTH_URL = google_api.AUTH_URL
TOKEN_URL = google_api.TOKEN_URL
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API_URL = "https://gmail.googleapis.com/gmail/v1/users/me"
SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
CALLBACK_PATH = "/gmail/callback"
# Refresh a little before Google's expiry so a read never starts with a token about to die.
EXPIRY_MARGIN = timedelta(minutes=5)
# Messages read at the same time. Google allows far more; this keeps one scan gentle.
PARALLEL_READS = 6

# OAuth error codes that mean the Google client is set up wrong (scopes, redirect URL, API off), not that the user said no.
SETUP_ERRORS = {"invalid_scope", "invalid_client", "unauthorized_client", "invalid_request", "redirect_uri_mismatch"}

log = logging.getLogger("orbit.gmail")

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class GmailError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class GmailAuthError(GmailError):
    """Google refused the token or the grant: the user has to connect Gmail again."""

    def __init__(self, message: str, status: int | None = None, code: str | None = None) -> None:
        super().__init__(message, status)
        self.code = code


class NotConnected(Exception):
    pass


@dataclass(frozen=True)
class MailHeader:
    """One email, as much as features need: who sent it, its subject, when, and Gmail's short preview."""

    id: str
    sender_name: str
    sender_email: str
    subject: str
    sent_at: datetime
    snippet: str

    @property
    def sender_domain(self) -> str:
        return self.sender_email.rpartition("@")[2].lower()


def redirect_uri() -> str:
    settings = get_settings()
    if settings.gmail_redirect_uri:
        return settings.gmail_redirect_uri
    found = urlparse(settings.google_redirect_uri)
    if not found.scheme or not found.netloc:
        return ""
    return f"{found.scheme}://{found.netloc}{CALLBACK_PATH}"


def configured() -> bool:
    return google_api.configured() and bool(redirect_uri())


def authorize_url(state: str, login_hint: str | None = None) -> str:
    query = {
        "response_type": "code",
        "client_id": get_settings().google_client_id,
        "redirect_uri": redirect_uri(),
        "scope": f"openid email {SCOPE}",
        "state": state,
        # offline + consent is what makes Google hand back a refresh token every time.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    if login_hint:
        query["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(query)}"


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=30.0)


def _error_code(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    code = body.get("error") if isinstance(body, dict) else None
    return code if isinstance(code, str) and code.replace("_", "").isalnum() else None


def _token_request(form: dict[str, str]) -> dict[str, Any]:
    settings = get_settings()
    form = {**form, "client_id": settings.google_client_id, "client_secret": settings.google_client_secret}
    try:
        with _client() as client:
            response = client.post(TOKEN_URL, data=form)
    except httpx.HTTPError as exc:
        raise GmailError(f"Can't reach Google: {exc.__class__.__name__}") from exc
    if response.status_code in (400, 401):
        code = _error_code(response)
        log.warning("Gmail token request (%s) refused: %s %s", form["grant_type"], response.status_code, code or "no error code")
        raise GmailAuthError("Google refused Gmail access. Connect Gmail again.", response.status_code, code)
    if response.status_code != 200:
        raise GmailError(f"Google sign-in failed ({response.status_code}).", response.status_code)
    return response.json()


def exchange_code(code: str) -> dict[str, Any]:
    return _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri()})


def get(access_token: str, path: str, params: Iterable[tuple[str, str]] | dict[str, str] | None = None) -> dict[str, Any]:
    try:
        with _client() as client:
            response = client.get(f"{API_URL}{path}", params=params, headers={"Authorization": f"Bearer {access_token}"})
    except httpx.HTTPError as exc:
        raise GmailError(f"Can't reach Gmail: {exc.__class__.__name__}") from exc
    return _answer(response, path)


def _answer(response: httpx.Response, path: str) -> dict[str, Any]:
    if response.status_code == 401:
        raise GmailAuthError("Gmail access expired or was removed. Connect Gmail again.", 401)
    if response.status_code == 403:
        # Usually the Gmail API is off in the Google Cloud project, or the scope wasn't granted.
        raise GmailError("Gmail refused to answer. Turn on the Gmail API in Google Cloud, then connect again.", 403)
    if response.status_code != 200:
        raise GmailError(f"Gmail answered {response.status_code} for {path.split('/')[1] or path}.", response.status_code)
    return response.json()


def profile_email(access_token: str) -> str:
    email = get(access_token, "/profile").get("emailAddress")
    if not isinstance(email, str) or "@" not in email:
        raise GmailError("Gmail didn't say which address this is.")
    return email


def revoke(token: str) -> None:
    """Tells Google to drop Orbit's access. Best effort: disconnecting never fails because of it."""
    try:
        with _client() as client:
            client.post(REVOKE_URL, data={"token": token})
    except httpx.HTTPError:
        pass


def save_tokens(connection: GmailConnection, tokens: dict[str, Any]) -> None:
    connection.access_token = encrypt_secret(tokens["access_token"])
    # Google leaves the refresh token out of a refresh answer: keep the one we have.
    if tokens.get("refresh_token"):
        connection.refresh_token = encrypt_secret(tokens["refresh_token"])
    connection.expires_at = datetime.now(UTC) + timedelta(seconds=int(tokens.get("expires_in") or 3600))
    if tokens.get("scope"):
        connection.scope = tokens["scope"]


def access_token(db: Session, user_id: uuid.UUID) -> str:
    """A working access token for this user's Gmail, refreshed when needed. Commits a refresh."""
    connection = db.get(GmailConnection, user_id)
    if connection is None:
        raise NotConnected
    if connection.expires_at - EXPIRY_MARGIN > datetime.now(UTC):
        token = decrypt_secret(connection.access_token)
        if token:
            return token
    refresh = decrypt_secret(connection.refresh_token)
    if not refresh:
        raise GmailAuthError("Gmail needs to be connected again.")
    try:
        tokens = _token_request({"grant_type": "refresh_token", "refresh_token": refresh})
    except GmailAuthError:
        connection.last_error = "Google refused Gmail access. Connect Gmail again."
        db.commit()
        raise
    save_tokens(connection, tokens)
    db.commit()
    return tokens["access_token"]


def search(access: str, query: str, limit: int = 200) -> list[str]:
    """Ids of the newest messages matching a Gmail search, up to `limit`."""
    ids: list[str] = []
    page: str | None = None
    while len(ids) < limit:
        params = {"q": query, "maxResults": str(min(100, limit - len(ids)))}
        if page:
            params["pageToken"] = page
        answer = get(access, "/messages", params)
        ids.extend(item["id"] for item in answer.get("messages") or [] if isinstance(item.get("id"), str))
        page = answer.get("nextPageToken")
        if not page:
            break
    return ids[:limit]


def _header(headers: list[dict[str, str]], name: str) -> str:
    for header in headers:
        if header.get("name", "").lower() == name:
            return header.get("value") or ""
    return ""


def parse_message(raw: dict[str, Any]) -> MailHeader | None:
    headers = (raw.get("payload") or {}).get("headers") or []
    sender_name, sender_email = parseaddr(_header(headers, "from"))
    if "@" not in sender_email:
        return None
    sent_at: datetime | None = None
    if raw.get("internalDate"):
        try:
            sent_at = datetime.fromtimestamp(int(raw["internalDate"]) / 1000, UTC)
        except (TypeError, ValueError):
            sent_at = None
    if sent_at is None:
        try:
            sent_at = parsedate_to_datetime(_header(headers, "date"))
        except (TypeError, ValueError):
            return None
    return MailHeader(
        id=str(raw.get("id") or ""),
        sender_name=sender_name.strip(),
        sender_email=sender_email.strip().lower(),
        subject=_header(headers, "subject").strip()[:300],
        sent_at=sent_at if sent_at.tzinfo else sent_at.replace(tzinfo=UTC),
        snippet=str(raw.get("snippet") or "")[:400],
    )


def message(access: str, message_id: str) -> MailHeader | None:
    """One message's sender, subject, date and preview. The body is never fetched."""
    params = [("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "Subject"), ("metadataHeaders", "Date")]
    return parse_message(get(access, f"/messages/{message_id}", params))


def messages(access: str, ids: list[str]) -> list[MailHeader]:
    """Many messages at once. A message that vanished in between is skipped; an auth failure stops everything."""

    def one(message_id: str) -> MailHeader | None:
        try:
            return message(access, message_id)
        except GmailAuthError:
            raise
        except GmailError as exc:
            if exc.status == 404:
                return None
            raise

    with ThreadPoolExecutor(max_workers=PARALLEL_READS) as pool:
        found = list(pool.map(one, ids))
    return [item for item in found if item is not None]


def _decode(data: str) -> str:
    try:
        return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")
    except (ValueError, binascii.Error):
        return ""


def _body_text(part: dict[str, Any], limit: int) -> str:
    """The readable text of a message part: plain text where the email has it, otherwise its HTML without the tags."""
    plain: list[str] = []
    html: list[str] = []

    def walk(node: dict[str, Any]) -> None:
        mime = str(node.get("mimeType") or "")
        data = (node.get("body") or {}).get("data")
        if isinstance(data, str) and data:
            if mime == "text/plain":
                plain.append(_decode(data))
            elif mime == "text/html":
                html.append(_decode(data))
        for child in node.get("parts") or []:
            if isinstance(child, dict):
                walk(child)

    walk(part)
    if plain:
        text = "\n".join(plain)
    else:
        text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", "\n".join(html))
        text = html_lib.unescape(re.sub(r"<[^>]+>", " ", text))
    return " ".join(text.split())[:limit]


def message_with_text(access: str, message_id: str, limit: int = 20_000) -> tuple[MailHeader, str] | None:
    """One message's headers and its text, for features that look for one thing inside (a tracking number).
    The text is only read in memory; callers keep just what they found, never the email."""
    raw = get(access, f"/messages/{message_id}", {"format": "full"})
    header = parse_message(raw)
    if header is None:
        return None
    return header, _body_text(raw.get("payload") or {}, limit)


def messages_with_text(access: str, ids: list[str]) -> list[tuple[MailHeader, str]]:
    """Many messages with their text. A message that vanished in between is skipped; an auth failure stops everything."""

    def one(message_id: str) -> tuple[MailHeader, str] | None:
        try:
            return message_with_text(access, message_id)
        except GmailAuthError:
            raise
        except GmailError as exc:
            if exc.status == 404:
                return None
            raise

    with ThreadPoolExecutor(max_workers=PARALLEL_READS) as pool:
        found = list(pool.map(one, ids))
    return [item for item in found if item is not None]
