"""The order tracker: shipments you follow, from a number you type or a shipping email, through your 17TRACK account.

GET /shipments lists them with what needs a look and what to announce. POST /shipments adds one. POST
/shipments/refresh looks through Gmail (when linked) and asks 17TRACK now. POST /shipments/seen marks alerts as shown.
PUT and DELETE /shipments/tracking link and unlink the 17TRACK key (stored encrypted, never sent back).
"""

import contextlib
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import Db, UserId
from app.models import ServiceConnection, Shipment, ShipmentScan
from app.models.shipments import SHIPMENT_STATUSES
from app.routers.gmail import GmailStatus, status_of
from app.routers.plan import user_today
from app.security import encrypt_secret
from app.services import shipments as tracker
from app.services import tracking_api

router = APIRouter(prefix="/shipments", tags=["shipments"])

Status = Literal[SHIPMENT_STATUSES]  # type: ignore[valid-type]
Alert = Literal["delivered", "problem", "out_for_delivery", "pickup", "late"]


class EventRow(BaseModel):
    at: datetime | None
    text: str
    place: str | None


class ShipmentRow(BaseModel):
    id: uuid.UUID
    number: str
    label: str | None
    store: str | None
    source: Literal["manual", "email"]
    carrier_name: str | None
    status: Status
    sub_status: str | None
    last_event: str | None
    last_location: str | None
    last_event_at: datetime | None
    eta_on: date | None
    delivered_at: datetime | None
    events: list[EventRow]
    registered: bool
    checked_at: datetime | None
    error: str | None
    archived: bool
    flags: list[str]
    # Something the app should announce once (then POST /shipments/seen).
    alert: Alert | None
    created_at: datetime


class TrackingStatus(BaseModel):
    connected: bool
    connected_at: datetime | None = None
    last_error: str | None = None
    refreshed_at: datetime | None = None


class Overview(BaseModel):
    shipments: list[ShipmentRow]
    tracking: TrackingStatus
    gmail: GmailStatus
    scanned_at: datetime | None
    emails_read: int
    email_error: str | None


class NewShipment(BaseModel):
    number: str = Field(min_length=5, max_length=60)
    label: str | None = Field(default=None, max_length=80)


class ShipmentChange(BaseModel):
    label: str | None = Field(default=None, max_length=80)
    archived: bool | None = None


class Seen(BaseModel):
    ids: list[uuid.UUID] = Field(max_length=200)


class TrackingConnect(BaseModel):
    api_key: str = Field(min_length=8, max_length=200)


class TrackingConnected(TrackingStatus):
    credits_left: int | None = None


# What needs a look first, then what is on its way, then what arrived.
def _order(row: ShipmentRow) -> tuple[int, date, str]:
    group = 0 if row.flags else 2 if row.status == "delivered" else 1
    return group, row.eta_on or date.max, (row.label or row.store or row.number).lower()


def _row(row: Shipment, today: date) -> ShipmentRow:
    return ShipmentRow(
        id=row.id,
        number=row.number,
        label=row.label,
        store=row.store,
        source=row.source,  # type: ignore[arg-type]
        carrier_name=row.carrier_name,
        status=row.status,
        sub_status=row.sub_status,
        last_event=row.last_event,
        last_location=row.last_location,
        last_event_at=row.last_event_at,
        eta_on=row.eta_on,
        delivered_at=row.delivered_at,
        events=[EventRow(**event) for event in row.events or [] if isinstance(event, dict) and event.get("text")],
        registered=row.registered,
        checked_at=row.checked_at,
        error=row.error,
        archived=row.archived,
        flags=tracker.flags(row, today),
        alert=tracker.pending_alert(row, today),  # type: ignore[arg-type]
        created_at=row.created_at,
    )


def _tracking(db: Db, user_id: uuid.UUID) -> TrackingStatus:
    connection = db.get(ServiceConnection, (user_id, tracking_api.PROVIDER))
    state = db.get(ShipmentScan, user_id)
    return TrackingStatus(
        connected=connection is not None,
        connected_at=connection.created_at if connection else None,
        last_error=state.tracking_error if state and connection else None,
        refreshed_at=state.refreshed_at if state else None,
    )


def _overview(db: Db, user_id: uuid.UUID) -> Overview:
    today = user_today(db, user_id)
    query = select(Shipment).where(Shipment.user_id == user_id, Shipment.archived.is_(False))
    rows = sorted((_row(r, today) for r in db.scalars(query)), key=_order)
    state = db.get(ShipmentScan, user_id)
    return Overview(
        shipments=rows,
        tracking=_tracking(db, user_id),
        gmail=status_of(db, user_id),
        scanned_at=state.scanned_at if state else None,
        emails_read=state.emails_read if state else 0,
        email_error=state.email_error if state else None,
    )


def _shipment(db: Db, user_id: uuid.UUID, shipment_id: uuid.UUID) -> Shipment:
    row = db.get(Shipment, shipment_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
    return row


@router.get("", response_model=Overview)
def list_shipments(user_id: UserId, db: Db):
    return _overview(db, user_id)


@router.post("", response_model=ShipmentRow, status_code=status.HTTP_201_CREATED)
def add_shipment(body: NewShipment, user_id: UserId, db: Db):
    try:
        row = tracker.add(db, user_id, body.number, label=(body.label or "").strip() or None)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return _row(row, user_today(db, user_id))


@router.post("/refresh", response_model=Overview)
def refresh_now(user_id: UserId, db: Db):
    """Looks through Gmail (when linked) and asks 17TRACK about everything on its way, now."""
    tracker.update_all(db, user_id, force=True)
    return _overview(db, user_id)


@router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_seen(body: Seen, user_id: UserId, db: Db):
    today = user_today(db, user_id)
    if body.ids:
        for row in db.scalars(select(Shipment).where(Shipment.user_id == user_id, Shipment.id.in_(body.ids))):
            row.alert_seen = tracker.alert(row, today) or row.alert_seen
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/tracking", response_model=TrackingConnected)
def connect_tracking(body: TrackingConnect, user_id: UserId, db: Db):
    """Checks the key with 17TRACK, then keeps it encrypted and asks about every shipment waiting for it."""
    key = body.api_key.strip()
    try:
        quota = tracking_api.quota(key)
    except tracking_api.KeyRejected as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except tracking_api.TrackingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    connection = db.get(ServiceConnection, (user_id, tracking_api.PROVIDER))
    if connection is None:
        connection = ServiceConnection(user_id=user_id, provider=tracking_api.PROVIDER, url=tracking_api.BASE_URL, api_key="")
        db.add(connection)
    connection.api_key = encrypt_secret(key)
    db.commit()
    with contextlib.suppress(tracking_api.TrackingError):
        tracker.refresh(db, user_id, force=True)
    return TrackingConnected(**_tracking(db, user_id).model_dump(), credits_left=quota.left)


@router.delete("/tracking", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_tracking(user_id: UserId, db: Db):
    """Orbit forgets the key. Shipments stay, and wait until a key is linked again."""
    connection = db.get(ServiceConnection, (user_id, tracking_api.PROVIDER))
    if connection is not None:
        db.delete(connection)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{shipment_id}", response_model=ShipmentRow)
def change_shipment(shipment_id: uuid.UUID, body: ShipmentChange, user_id: UserId, db: Db):
    """Rename it, or take it off the list (archived) and back."""
    row = _shipment(db, user_id, shipment_id)
    fields = body.model_fields_set
    if "label" in fields:
        row.label = (body.label or "").strip() or None
    if "archived" in fields and body.archived is not None:
        row.archived = body.archived
    db.commit()
    db.refresh(row)
    return _row(row, user_today(db, user_id))


@router.delete("/{shipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shipment(shipment_id: uuid.UUID, user_id: UserId, db: Db):
    row = _shipment(db, user_id, shipment_id)
    if row.registered:
        with contextlib.suppress(tracker.NoKey):
            tracking_api.delete(tracker.api_key(db, user_id), [(row.number, row.carrier_code)])
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
