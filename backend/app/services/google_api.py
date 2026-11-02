"""A small client for Google's OAuth 2.0 sign-in (the web server flow). Tests swap `transport` for a mock."""

from typing import Any
from urllib.parse import urlencode

import httpx2 as httpx

from app.config import get_settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class GoogleError(Exception):
    pass


def configured() -> bool:
    settings = get_settings()
    return bool(settings.google_client_id and settings.google_client_secret and settings.google_redirect_uri)


def authorize_url(state: str) -> str:
    settings = get_settings()
    query = {
        "response_type": "code",
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTH_URL}?{urlencode(query)}"


def fetch_identity(code: str) -> dict[str, Any]:
    """Trades the sign-in code for who the person is: sub, email, email_verified and name."""
    settings = get_settings()
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
    }
    try:
        with httpx.Client(transport=transport, timeout=30.0) as client:
            tokens = client.post(TOKEN_URL, data=form)
            if tokens.status_code != 200:
                raise GoogleError(f"Google refused the sign-in ({tokens.status_code}).")
            identity = client.get(USERINFO_URL, headers={"Authorization": f"Bearer {tokens.json()['access_token']}"})
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise GoogleError(f"Can't reach Google: {exc.__class__.__name__}") from exc
    if identity.status_code != 200:
        raise GoogleError(f"Google answered {identity.status_code} for the user's details.")
    found = identity.json()
    if not found.get("sub") or not found.get("email"):
        raise GoogleError("Google didn't say who this is.")
    return found
