"""17TRACK, with the user's own API key: register a tracking number, then read its status and events.

17TRACK covers about 3,000 carriers, the Saudi ones among them (Aramex, SMSA, SPL / Saudi Post, J&T, DHL, Naqel) and
the ones shops abroad use. Each user brings their own key (17TRACK's site → API → Settings); it is stored encrypted
in service_connections (provider "17track") and never sent back to the app.

How 17TRACK counts: registering a number uses one tracking credit of the account (the free plan has a small yearly
allowance), reading it afterwards is free. So Orbit registers a number once and then only reads.

API v2.2: POST https://api.17track.net/track/v2.2/<call>, a JSON list body, the key in the "17token" header. The
answer is {"code": 0, "data": {"accepted": [...], "rejected": [{"number", "error": {"code", "message"}}]}}.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

import httpx2 as httpx

BASE_URL = "https://api.17track.net/track/v2.2"
PROVIDER = "17track"
# 17TRACK takes at most 40 numbers per call.
BATCH = 40

# Rejection codes that mean "this is fine already": the number is registered on the account.
ALREADY_REGISTERED = -18019901
NOT_REGISTERED = -18019902

# 17TRACK's main states → ours (app/models/shipments.py).
STATUSES = {
    "NotFound": "not_found",
    "InfoReceived": "info_received",
    "InTransit": "in_transit",
    "Expired": "expired",
    "AvailableForPickup": "pickup",
    "OutForDelivery": "out_for_delivery",
    "DeliveryFailure": "failed",
    "Delivered": "delivered",
    "Exception": "exception",
}

log = logging.getLogger("orbit.tracking")

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class TrackingError(Exception):
    pass


class KeyRejected(TrackingError):
    """17TRACK said the key is wrong, or the server's address isn't allowed for it."""


@dataclass(frozen=True)
class Event:
    at: datetime | None
    text: str
    place: str | None

    def as_json(self) -> dict[str, Any]:
        return {"at": self.at.isoformat() if self.at else None, "text": self.text, "place": self.place}


@dataclass(frozen=True)
class TrackInfo:
    number: str
    status: str
    sub_status: str | None = None
    carrier_code: int | None = None
    carrier_name: str | None = None
    eta_on: date | None = None
    events: list[Event] = field(default_factory=list)

    @property
    def latest(self) -> Event | None:
        return self.events[0] if self.events else None


@dataclass(frozen=True)
class Quota:
    total: int
    used: int
    left: int


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=30.0)


def call(api_key: str, name: str, body: Any) -> dict[str, Any]:
    try:
        with _client() as client:
            response = client.post(f"{BASE_URL}/{name}", json=body, headers={"17token": api_key, "Content-Type": "application/json"})
    except httpx.HTTPError as exc:
        raise TrackingError(f"Can't reach 17TRACK: {exc.__class__.__name__}") from exc
    if response.status_code in (401, 403):
        raise KeyRejected("17TRACK refused the key. Check it, and that the server's address is allowed in 17TRACK's API settings.")
    if response.status_code == 429:
        raise TrackingError("17TRACK is busy. Try again in a minute.")
    if response.status_code != 200:
        raise TrackingError(f"17TRACK answered {response.status_code}.")
    try:
        answer = response.json()
    except ValueError as exc:
        raise TrackingError("17TRACK sent an answer Orbit couldn't read.") from exc
    if not isinstance(answer, dict):
        raise TrackingError("17TRACK sent an answer Orbit couldn't read.")
    code = answer.get("code")
    if code not in (0, None):
        # Account-level problems (bad key, no credits left) come back as a non-zero code with a message.
        message = _message(answer.get("data")) or f"17TRACK error {code}"
        lowered = message.lower()
        if code == 401 or any(word in lowered for word in ("token", "security key", "api key", "ip ")):
            raise KeyRejected(message)
        raise TrackingError(message)
    data = answer.get("data")
    return data if isinstance(data, dict) else {}


def _message(data: Any) -> str | None:
    if isinstance(data, dict):
        for item in data.get("errors") or []:
            if isinstance(item, dict) and isinstance(item.get("message"), str):
                return item["message"][:200]
    return None


def _items(numbers: list[tuple[str, int | None]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for number, carrier in numbers:
        item: dict[str, Any] = {"number": number}
        if carrier:
            item["carrier"] = carrier
        items.append(item)
    return items


def quota(api_key: str) -> Quota:
    """Also how a new key is checked: a wrong key fails here."""
    data = call(api_key, "getquota", {})

    def number(name: str) -> int:
        value = data.get(name)
        return int(value) if isinstance(value, int | float) else 0

    return Quota(total=number("quota_total"), used=number("quota_used"), left=number("quota_remain"))


def register(api_key: str, numbers: list[tuple[str, int | None]]) -> tuple[set[str], dict[str, str]]:
    """Registers numbers (at most BATCH). Returns the accepted ones (already registered counts) and why others failed."""
    if not numbers:
        return set(), {}
    data = call(api_key, "register", _items(numbers[:BATCH]))
    accepted = {str(item.get("number")).upper() for item in data.get("accepted") or [] if isinstance(item, dict)}
    rejected: dict[str, str] = {}
    for item in data.get("rejected") or []:
        if not isinstance(item, dict):
            continue
        number = str(item.get("number") or "").upper()
        error = item.get("error") if isinstance(item.get("error"), dict) else {}
        if error.get("code") == ALREADY_REGISTERED:
            accepted.add(number)
        else:
            rejected[number] = str(error.get("message") or "17TRACK didn't accept this number.")[:200]
    return accepted, rejected


def track_info(api_key: str, numbers: list[tuple[str, int | None]]) -> tuple[dict[str, TrackInfo], dict[str, int]]:
    """Status and events of registered numbers (at most BATCH). Also returns the rejection code of numbers it skipped."""
    if not numbers:
        return {}, {}
    data = call(api_key, "gettrackinfo", _items(numbers[:BATCH]))
    found: dict[str, TrackInfo] = {}
    for item in data.get("accepted") or []:
        if isinstance(item, dict) and (info := parse_info(item)):
            found[info.number] = info
    rejected: dict[str, int] = {}
    for item in data.get("rejected") or []:
        if isinstance(item, dict):
            error = item.get("error") if isinstance(item.get("error"), dict) else {}
            rejected[str(item.get("number") or "").upper()] = int(error.get("code") or 0)
    return found, rejected


def delete(api_key: str, numbers: list[tuple[str, int | None]]) -> None:
    """Stops following numbers on the account. Best effort: removing a shipment in Orbit never fails because of it."""
    if not numbers:
        return
    try:
        call(api_key, "deletetrack", _items(numbers[:BATCH]))
    except TrackingError as exc:
        log.info("17TRACK delete didn't go through: %s", exc.__class__.__name__)


def _time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        found = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return found if found.tzinfo else found.replace(tzinfo=UTC)


def _day(value: Any) -> date | None:
    found = _time(value)
    return found.date() if found else None


def _text(value: Any, limit: int = 300) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned[:limit] or None


def parse_info(item: dict[str, Any]) -> TrackInfo | None:
    number = str(item.get("number") or "").upper()
    if not number:
        return None
    info = item.get("track_info") if isinstance(item.get("track_info"), dict) else {}
    latest = info.get("latest_status") if isinstance(info.get("latest_status"), dict) else {}
    status = STATUSES.get(str(latest.get("status") or ""), "pending" if not info else "not_found")

    carrier_code = item.get("carrier") if isinstance(item.get("carrier"), int) else None
    carrier_name: str | None = None
    events: list[Event] = []
    tracking = info.get("tracking") if isinstance(info.get("tracking"), dict) else {}
    for provider in tracking.get("providers") or []:
        if not isinstance(provider, dict):
            continue
        about = provider.get("provider") if isinstance(provider.get("provider"), dict) else {}
        if carrier_name is None:
            carrier_name = _text(about.get("name"), 80)
            if carrier_code is None and isinstance(about.get("key"), int):
                carrier_code = about["key"]
        for event in provider.get("events") or []:
            if not isinstance(event, dict) or not (text := _text(event.get("description"))):
                continue
            events.append(
                Event(at=_time(event.get("time_utc")) or _time(event.get("time_iso")), text=text, place=_text(event.get("location"), 120))
            )
    if not events and isinstance(info.get("latest_event"), dict):
        event = info["latest_event"]
        if text := _text(event.get("description")):
            events.append(
                Event(at=_time(event.get("time_utc")) or _time(event.get("time_iso")), text=text, place=_text(event.get("location"), 120))
            )
    # Newest first; events without a time keep their place after the timed ones.
    events.sort(key=lambda e: e.at or datetime.min.replace(tzinfo=UTC), reverse=True)

    eta: date | None = None
    metrics = info.get("time_metrics") if isinstance(info.get("time_metrics"), dict) else {}
    estimate = metrics.get("estimated_delivery_date") if isinstance(metrics.get("estimated_delivery_date"), dict) else {}
    eta = _day(estimate.get("to")) or _day(estimate.get("from"))
    return TrackInfo(
        number=number,
        status=status,
        sub_status=_text(latest.get("sub_status"), 60),
        carrier_code=carrier_code,
        carrier_name=carrier_name,
        eta_on=eta,
        events=events,
    )
