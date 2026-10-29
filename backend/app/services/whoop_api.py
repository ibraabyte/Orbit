"""A small client for WHOOP's OAuth 2.0 and developer API v2 (https://developer.whoop.com).

Uses httpx2 (the HTTP library the Anthropic SDK already brings). Tests swap `transport` for a mock.
"""

import time
from collections.abc import Iterator
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

import httpx2 as httpx

from app.config import get_settings

AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
API_URL = "https://api.prod.whoop.com/developer"
# offline is what makes WHOOP return a refresh token, so the sync keeps working without the user.
SCOPES = "offline read:profile read:recovery read:cycles read:sleep read:workout"
PAGE_SIZE = 25  # WHOOP's maximum

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class WhoopError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class WhoopAuthError(WhoopError):
    """WHOOP refused the token or the grant: the user has to connect again."""


def configured() -> bool:
    settings = get_settings()
    return bool(settings.whoop_client_id and settings.whoop_client_secret and settings.whoop_redirect_uri)


def authorize_url(state: str) -> str:
    settings = get_settings()
    query = {
        "response_type": "code",
        "client_id": settings.whoop_client_id,
        "redirect_uri": settings.whoop_redirect_uri,
        "scope": SCOPES,
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(query)}"


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=30.0)


def _token_request(form: dict[str, str]) -> dict[str, Any]:
    settings = get_settings()
    form = {**form, "client_id": settings.whoop_client_id, "client_secret": settings.whoop_client_secret}
    try:
        with _client() as client:
            response = client.post(TOKEN_URL, data=form)
    except httpx.HTTPError as exc:
        raise WhoopError(f"Can't reach WHOOP: {exc.__class__.__name__}") from exc
    if response.status_code in (400, 401):
        raise WhoopAuthError("WHOOP refused the sign-in. Connect WHOOP again.", response.status_code)
    if response.status_code != 200:
        raise WhoopError(f"WHOOP sign-in failed ({response.status_code}).", response.status_code)
    return response.json()


def exchange_code(code: str) -> dict[str, Any]:
    return _token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": get_settings().whoop_redirect_uri})


def refresh_tokens(refresh_token: str) -> dict[str, Any]:
    return _token_request({"grant_type": "refresh_token", "refresh_token": refresh_token, "scope": "offline"})


def get(access_token: str, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    """GET one API path. Waits out a rate limit once, and turns a 401 into WhoopAuthError."""
    headers = {"Authorization": f"Bearer {access_token}"}
    with _client() as client:
        for attempt in range(2):
            try:
                response = client.get(f"{API_URL}{path}", params=params, headers=headers)
            except httpx.HTTPError as exc:
                raise WhoopError(f"Can't reach WHOOP: {exc.__class__.__name__}") from exc
            if response.status_code == 429 and attempt == 0:
                time.sleep(min(float(response.headers.get("Retry-After") or 5), 60))
                continue
            break
    if response.status_code == 401:
        raise WhoopAuthError("WHOOP token expired or was revoked.", 401)
    if response.status_code != 200:
        raise WhoopError(f"WHOOP answered {response.status_code} for {path}.", response.status_code)
    return response.json()


def collection(access_token: str, path: str, start: datetime) -> Iterator[dict[str, Any]]:
    """Every record in a paginated collection that starts at or after `start`."""
    params = {"limit": str(PAGE_SIZE), "start": start.isoformat()}
    while True:
        page = get(access_token, path, params)
        yield from page.get("records") or []
        next_token = page.get("next_token")
        if not next_token:
            return
        params = {**params, "nextToken": next_token}


def revoke(access_token: str) -> None:
    """Tells WHOOP to drop Orbit's access. Best effort: disconnecting never fails because of it."""
    try:
        with _client() as client:
            client.delete(f"{API_URL}/v2/user/access", headers={"Authorization": f"Bearer {access_token}"})
    except httpx.HTTPError:
        pass
