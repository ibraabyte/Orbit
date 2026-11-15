"""Talks to a user's own Seerr (Overseerr / Jellyseerr) server with the key they saved in the app.

The server makes these calls, so the address is checked first: unless the user is an admin, it must not point
inside the server's own network (localhost, 10.x, 192.168.x, the database container...). Otherwise anyone with an
account could use Orbit to reach things that aren't meant to be public.
"""

import hashlib
import hmac
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import quote, urlsplit

import httpx2 as httpx

from app.config import get_settings

# Replaced in tests with httpx2.MockTransport (and `resolve` with a fake).
transport: httpx.BaseTransport | None = None
TIMEOUT = 15.0
MAX_BYTES = 5 * 1024 * 1024

# Only the Seerr calls the app makes. Anything else is refused before it leaves the server.
ALLOWED: list[tuple[str, re.Pattern[str]]] = [
    (method, re.compile(pattern))
    for method, pattern in [
        ("GET", r"status"),
        ("GET", r"auth/me"),
        ("GET", r"search"),
        # Discover: the rows on the Movies & TV screen and their "see all" lists.
        ("GET", r"discover/trending"),
        ("GET", r"discover/(movies|tv)(/upcoming)?"),
        ("GET", r"discover/(movies|tv)/genre/\d+"),
        ("GET", r"discover/movies/studio/\d+"),
        ("GET", r"discover/tv/network/\d+"),
        ("GET", r"discover/watchlist"),
        ("GET", r"genres/(movie|tv)"),
        # The rails the admin arranged in Seerr, what arrived on the media server last, and streaming services.
        ("GET", r"settings/discover"),
        ("GET", r"media"),
        ("GET", r"watchproviders/(movies|tv)"),
        # One title: details, its seasons and episodes, ratings, and what is like it.
        ("GET", r"(movie|tv)/\d+"),
        ("GET", r"(movie|tv)/\d+/(recommendations|similar)"),
        ("GET", r"movie/\d+/ratings"),
        ("GET", r"tv/\d+/season/\d+"),
        ("GET", r"person/\d+(/combined_credits)?"),
        ("GET", r"collection/\d+"),
        # Requests. Seerr itself decides who may see, approve, retry or cancel which request.
        ("GET", r"request"),
        ("GET", r"request/count"),
        ("POST", r"request"),
        ("POST", r"request/\d+/(approve|decline)"),
        ("POST", r"request/\d+/retry"),
        ("DELETE", r"request/\d+"),
        ("GET", r"user/\d+/quota"),
        # Managing one title, for people Seerr lets manage requests: mark it available, clear what Seerr knows, remove
        # it from Radarr/Sonarr, and the blocklist. Seerr checks the permission itself.
        ("POST", r"media/\d+/available"),
        ("DELETE", r"media/\d+(/file)?"),
        ("POST", r"blocklist"),
        ("DELETE", r"blocklist/\d+"),
        # Advanced request options: the Radarr/Sonarr servers Seerr sends to, and one server's quality profiles and
        # folders. Seerr answers these without the servers' keys, and decides itself who may use them in a request.
        ("GET", r"service/(radarr|sonarr)"),
        ("GET", r"service/(radarr|sonarr)/\d+"),
    ]
]


class SeerrError(Exception):
    pass


class SeerrKeyRejected(SeerrError):
    pass


class BadAddress(SeerrError):
    """The address itself is the problem (malformed, unknown, or not allowed)."""


class BlockedAddress(BadAddress):
    pass


def normalize_url(url: str) -> str:
    """Same rules as normalizeSeerrUrl in src/lib/seerr.ts: trim, drop a trailing /api/v1, default to https."""
    trimmed = re.sub(r"/api/v1$", "", url.strip().rstrip("/")).rstrip("/")
    if not re.match(r"^https?://", trimmed, re.IGNORECASE):
        trimmed = f"https://{trimmed}"
    parts = urlsplit(trimmed)
    if not parts.hostname or parts.username or parts.password or parts.query or parts.fragment:
        raise BadAddress("That doesn't look like a server address.")
    return trimmed


def allowed(method: str, path: str) -> bool:
    return any(method == m and pattern.fullmatch(path) for m, pattern in ALLOWED)


def resolve(host: str, port: int) -> list[str]:
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)]
    except (socket.gaierror, UnicodeError) as exc:
        raise BadAddress("Can't find that server. Check the address.") from exc


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%")[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def check_address(url: str, *, allow_private: bool) -> None:
    """Checked on every call, not only when saving, so a name that later points inside the network is caught too."""
    if allow_private:
        return
    parts = urlsplit(url)
    port = parts.port or (443 if parts.scheme == "https" else 80)
    addresses = resolve(parts.hostname or "", port)
    if not addresses or not all(_is_public(address) for address in addresses):
        raise BlockedAddress("That address is inside a private network. Use the server's public address.")


def call(
    url: str,
    api_key: str,
    method: str,
    path: str,
    *,
    params: list[tuple[str, str]] | None = None,
    json: Any = None,
    allow_private: bool = False,
) -> tuple[int, Any]:
    """One Seerr API call. Returns (status, parsed JSON or None). Raises SeerrKeyRejected on 401/403."""
    check_address(url, allow_private=allow_private)
    # Built by hand: httpx writes spaces as "+", and Seerr rejects reserved characters in the raw query.
    query = "&".join(f"{quote(key, safe='')}={quote(value, safe='')}" for key, value in params or [])
    try:
        # No redirects: a redirect could send the call (and the key) somewhere that wasn't checked.
        with httpx.Client(transport=transport, timeout=TIMEOUT, follow_redirects=False) as client:
            response = client.request(
                method,
                f"{url}/api/v1/{path}" + (f"?{query}" if query else ""),
                json=json,
                headers={"X-Api-Key": api_key, "Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise SeerrError("Can't reach the Seerr server.") from exc
    if response.status_code in (401, 403):
        raise SeerrKeyRejected("Seerr rejected the API key.")
    if 300 <= response.status_code < 400:
        raise SeerrError("The Seerr server answered with a redirect. Use its final address.")
    if len(response.content) > MAX_BYTES:
        raise SeerrError("Seerr sent back too much data.")
    if response.status_code == 204 or not response.content:
        return response.status_code, None
    try:
        return response.status_code, response.json()
    except ValueError as exc:
        raise SeerrError("That server didn't answer like Seerr does.") from exc


# Seerr's webhook: Seerr calls Orbit when something happens to a request or an issue, and Orbit tells the phone.
# The address carries the user's id and a signature made from the server's secret, so nobody can guess another
# user's address and no extra key has to be stored.
def webhook_signature(user_id: object) -> str:
    secret = get_settings().jwt_secret.encode()
    return hmac.new(secret, f"orbit:seerr-webhook:{user_id}".encode(), hashlib.sha256).hexdigest()[:40]


def webhook_path(user_id: object) -> str:
    return f"/integrations/seerr/webhook/{user_id}/{webhook_signature(user_id)}"


# Seerr's notification types (the default JSON payload's "notification_type") → (Arabic, English) headline.
HEADLINES: dict[str, tuple[str, str]] = {
    "MEDIA_PENDING": ("طلب جديد ينتظر موافقتك", "New request waiting for you"),
    "MEDIA_AUTO_REQUESTED": ("طلب تلقائي جديد", "New automatic request"),
    "MEDIA_APPROVED": ("قُبل الطلب", "Request approved"),
    "MEDIA_AUTO_APPROVED": ("قُبل الطلب", "Request approved"),
    "MEDIA_AVAILABLE": ("جاهز للمشاهدة", "Ready to watch"),
    "MEDIA_DECLINED": ("رُفض الطلب", "Request declined"),
    "MEDIA_FAILED": ("تعذّر تنزيل الطلب", "Request failed"),
    "ISSUE_CREATED": ("بلاغ جديد", "New issue"),
    "ISSUE_COMMENT": ("تعليق جديد على بلاغ", "New comment on an issue"),
    "ISSUE_RESOLVED": ("حُلّ البلاغ", "Issue resolved"),
    "ISSUE_REOPENED": ("أُعيد فتح البلاغ", "Issue reopened"),
    "TEST_NOTIFICATION": ("تنبيهات Seerr تعمل", "Seerr notifications work"),
}


def _text(value: Any, limit: int = 200) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def notification(payload: dict[str, Any]) -> tuple[dict[str, tuple[str, str]], dict[str, Any]] | None:
    """Seerr's webhook body → texts for push.send and the screen a tap opens. None for something not worth a push."""
    kind = _text(payload.get("notification_type"), 40)
    subject = _text(payload.get("subject"))
    if kind not in HEADLINES and not subject:
        return None
    ar, en = HEADLINES.get(kind, (subject, subject))
    if kind == "TEST_NOTIFICATION":
        body_ar, body_en = "وصل التنبيه التجريبي إلى جوالك.", "The test notification reached your phone."
    else:
        requested = payload.get("request") if isinstance(payload.get("request"), dict) else {}
        by = _text(requested.get("requestedBy_username"), 80) if kind == "MEDIA_PENDING" else ""
        body_ar = " · ".join(part for part in (subject, f"طلبه {by}" if by else "") if part) or ar
        body_en = " · ".join(part for part in (subject, f"by {by}" if by else "") if part) or en
    media = payload.get("media") if isinstance(payload.get("media"), dict) else {}
    kind_of_media, tmdb_id = media.get("media_type"), str(media.get("tmdbId") or "")
    data = (
        {"url": f"/title?kind={kind_of_media}&id={tmdb_id}"}
        if kind_of_media in ("movie", "tv") and tmdb_id.isdigit()
        else {"url": "/media"}
    )
    return {"ar": (ar, body_ar), "en": (en, body_en)}, data
