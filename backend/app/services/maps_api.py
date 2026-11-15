"""Google Maps Platform, with the user's own API key: how long the way to a place takes, and finding a place by name.

Each user brings their own key (Google Cloud console → Google Maps Platform → Keys & Credentials) with two APIs on:
- Routes API (computeRoutes): the travel time, with traffic when driving.
- Places API (New) (Text Search): finding the place to put on a task.
The key is stored encrypted in service_connections (provider "google_maps") and never sent back to the app.

What goes to Google: the phone's position at that moment (sent by the app, never stored), the place (its Google id, or
the address as typed) and the time. Google's terms allow keeping a place id, so that and the name are all Orbit keeps.

Calls: POST https://routes.googleapis.com/directions/v2:computeRoutes and POST
https://places.googleapis.com/v1/places:searchText, the key in "X-Goog-Api-Key" and the wanted fields in
"X-Goog-FieldMask". Errors come back as {"error": {"code", "message", "status"}}.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import httpx2 as httpx

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
PROVIDER = "google_maps"
# Shown as the connection's address; there is no per-user server.
BASE_URL = "https://maps.googleapis.com"

Mode = Literal["drive", "walk", "transit"]
MODES: dict[str, str] = {"drive": "DRIVE", "walk": "WALK", "transit": "TRANSIT"}
SEARCH_RESULTS = 6
# Places near the phone come first (a 50 km circle), but further ones are still found.
BIAS_METERS = 50_000.0

log = logging.getLogger("orbit.maps")

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class MapsError(Exception):
    pass


class KeyRejected(MapsError):
    """Google refused the key, or the API it needs is not turned on for it."""


@dataclass(frozen=True)
class Point:
    lat: float
    lng: float

    def waypoint(self) -> dict[str, Any]:
        return {"location": {"latLng": {"latitude": self.lat, "longitude": self.lng}}}


@dataclass(frozen=True)
class Route:
    minutes: int
    meters: int | None


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    address: str | None


def destination(place_name: str, place_id: str | None) -> dict[str, Any]:
    return {"placeId": place_id} if place_id else {"address": place_name}


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=20.0)


def _rfc3339(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _problem(response: httpx.Response, api: str) -> MapsError:
    try:
        error = response.json().get("error") or {}
    except (ValueError, AttributeError):
        error = {}
    message = str(error.get("message") or "")
    state = str(error.get("status") or "")
    lowered = message.lower()
    if response.status_code in (401, 403) or state in ("PERMISSION_DENIED", "UNAUTHENTICATED") or "api key" in lowered:
        if "not been used" in lowered or "disabled" in lowered or "blocked" in lowered or "not authorized" in lowered:
            return KeyRejected(f"Google says {api} is not turned on for this key. Turn it on in the Google Cloud console.")
        if "billing" in lowered:
            return KeyRejected("Google needs a billing account on this key's project before it answers.")
        return KeyRejected("Google refused the key. Check it in the Google Cloud console.")
    if response.status_code == 429 or state == "RESOURCE_EXHAUSTED":
        return MapsError("Google Maps is busy or the key's daily limit is reached. Try again later.")
    if response.status_code == 400:
        return MapsError("Google couldn't use that place or time.")
    return MapsError(f"Google Maps answered {response.status_code}.")


def _post(url: str, api_key: str, fields: str, body: dict[str, Any], api: str) -> dict[str, Any]:
    headers = {"X-Goog-Api-Key": api_key, "X-Goog-FieldMask": fields, "Content-Type": "application/json"}
    try:
        with _client() as client:
            response = client.post(url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        raise MapsError(f"Can't reach Google Maps: {exc.__class__.__name__}") from exc
    if response.status_code != 200:
        raise _problem(response, api)
    try:
        answer = response.json()
    except ValueError as exc:
        raise MapsError("Google Maps sent an answer Orbit couldn't read.") from exc
    return answer if isinstance(answer, dict) else {}


_SECONDS = re.compile(r"^(\d+(?:\.\d+)?)s$")


def _minutes(value: Any) -> int | None:
    match = _SECONDS.match(value) if isinstance(value, str) else None
    if not match:
        return None
    # Rounded up: arriving a minute early beats arriving a minute late.
    return max(1, -(-int(float(match[1])) // 60))


def route(
    api_key: str,
    origin: Point,
    to: dict[str, Any],
    mode: Mode = "drive",
    depart_at: datetime | None = None,
    arrive_by: datetime | None = None,
    language: str = "en",
) -> Route | None:
    """The way there, or None when Google finds no way (another country, no transit at that hour)."""
    body: dict[str, Any] = {"origin": origin.waypoint(), "destination": to, "travelMode": MODES[mode], "languageCode": language}
    if mode == "drive":
        # With traffic, for the moment of leaving.
        body["routingPreference"] = "TRAFFIC_AWARE"
    if mode == "transit" and arrive_by is not None:
        # Only transit can plan backwards from the time to be there.
        body["arrivalTime"] = _rfc3339(arrive_by)
    elif depart_at is not None:
        body["departureTime"] = _rfc3339(depart_at)
    answer = _post(ROUTES_URL, api_key, "routes.duration,routes.distanceMeters", body, "the Routes API")
    routes = answer.get("routes")
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        return None
    minutes = _minutes(routes[0].get("duration"))
    if minutes is None:
        return None
    meters = routes[0].get("distanceMeters")
    return Route(minutes=minutes, meters=meters if isinstance(meters, int) else None)


def search(api_key: str, text: str, near: Point | None = None, language: str = "en") -> list[Place]:
    body: dict[str, Any] = {"textQuery": text, "languageCode": language, "pageSize": SEARCH_RESULTS}
    if near is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": near.lat, "longitude": near.lng}, "radius": BIAS_METERS}}
    answer = _post(PLACES_URL, api_key, "places.id,places.displayName,places.formattedAddress", body, "the Places API (New)")
    found: list[Place] = []
    for item in answer.get("places") or []:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            continue
        name = (item.get("displayName") or {}).get("text") if isinstance(item.get("displayName"), dict) else None
        address = item.get("formattedAddress") if isinstance(item.get("formattedAddress"), str) else None
        title = (name or address or "").strip()[:160]
        if title and re.fullmatch(r"[A-Za-z0-9_-]{1,300}", item["id"]):
            found.append(Place(id=item["id"], name=title, address=address))
    return found


# Two made-up points in Riyadh, a few kilometres apart: enough for Google to say whether the key works.
_CHECK_FROM = Point(24.7136, 46.6753)
_CHECK_TO = {"location": {"latLng": {"latitude": 24.7743, "longitude": 46.7386}}}


def check(api_key: str) -> None:
    """Raises KeyRejected naming the API that is missing. One route and one place search (ids only)."""
    route(api_key, _CHECK_FROM, _CHECK_TO, "drive")
    _post(PLACES_URL, api_key, "places.id", {"textQuery": "Riyadh", "pageSize": 1}, "the Places API (New)")
