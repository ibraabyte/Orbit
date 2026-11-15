"""Push notifications to the user's phones, through Expo's push service (the app registers its Expo push token).

Uses httpx2 like the other outside calls. Tests swap `transport` for a mock.
"""

import logging
import uuid
from typing import Any

import httpx2 as httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import PushDevice

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
TIMEOUT = 10.0
# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


def send(db: Session, user_id: uuid.UUID, texts: dict[str, tuple[str, str]], data: dict[str, Any] | None = None) -> int:
    """Sends one notification to every phone of this user, each in its own language: texts maps "ar"/"en" to
    (title, body). Returns how many phones Expo accepted it for. Phones Expo no longer knows are forgotten."""
    devices = db.scalars(select(PushDevice).where(PushDevice.user_id == user_id)).all()
    if not devices:
        return 0
    messages = [
        {"to": device.token, "title": texts[device.language][0], "body": texts[device.language][1], "sound": "default", "data": data or {}}
        for device in devices
    ]
    try:
        with httpx.Client(transport=transport, timeout=TIMEOUT) as client:
            response = client.post(EXPO_PUSH_URL, json=messages, headers={"Accept": "application/json"})
        tickets = response.json().get("data", []) if response.status_code == 200 else []
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Expo push failed: %s", exc)
        return 0
    # Tickets come back in the same order as the messages.
    gone = [
        m["to"] for m, ticket in zip(messages, tickets, strict=False) if ticket.get("details", {}).get("error") == "DeviceNotRegistered"
    ]
    if gone:
        db.execute(delete(PushDevice).where(PushDevice.token.in_(gone)))
        db.commit()
    return sum(1 for ticket in tickets if ticket.get("status") == "ok")
