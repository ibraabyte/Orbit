"""Google Maps, with the user's own key: find a place for a task, and when to leave for the day's appointments.

GET /maps says whether a key is linked. PUT and DELETE /maps/key link and unlink it (checked with Google first, stored
encrypted, never sent back). POST /maps/places searches places by name. POST /maps/leave times the coming appointments
from where the phone is now; the position is passed on to Google and not kept.
"""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.deps import Db, UserId
from app.models import ServiceConnection
from app.routers.plan import user_zone
from app.security import encrypt_secret
from app.services import leave_times, maps_api
from app.services.leave_times import Status
from app.services.maps_api import Mode, Point

router = APIRouter(prefix="/maps", tags=["maps"])


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(Input):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    def point(self) -> Point:
        return Point(self.lat, self.lng)


class MapsStatus(BaseModel):
    connected: bool
    connected_at: datetime | None


class KeyIn(Input):
    api_key: str = Field(min_length=20, max_length=200, pattern=r"^\s*[A-Za-z0-9_-]+\s*$")


class PlaceSearch(Input):
    query: str = Field(min_length=2, max_length=120)
    near: Position | None = None
    locale: str = Field(default="en", pattern=r"^(en|ar)$")


class PlaceOut(BaseModel):
    id: str
    name: str
    address: str | None


class LeaveRequest(Input):
    origin: Position
    mode: Mode = "drive"
    # Minutes to spare on arrival (parking, finding the door).
    buffer_minutes: int = Field(default=10, ge=0, le=60)
    hours: int = Field(default=24, ge=1, le=48)
    locale: str = Field(default="en", pattern=r"^(en|ar)$")


class LeaveOut(BaseModel):
    task_id: uuid.UUID
    title: str
    place_name: str
    due_at: datetime
    travel_minutes: int | None
    meters: int | None
    leave_at: datetime | None
    status: Status


class LeaveReply(BaseModel):
    mode: Mode
    buffer_minutes: int
    checked_at: datetime
    items: list[LeaveOut]


def _status(db: Db, user_id: uuid.UUID) -> MapsStatus:
    connection = db.get(ServiceConnection, (user_id, maps_api.PROVIDER))
    return MapsStatus(connected=connection is not None, connected_at=connection.created_at if connection else None)


def _key(db: Db, user_id: uuid.UUID) -> str:
    key = leave_times.api_key(db, user_id)
    if key is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Link your Google Maps key first.")
    return key


def _google_failed(exc: maps_api.MapsError) -> HTTPException:
    code = status.HTTP_400_BAD_REQUEST if isinstance(exc, maps_api.KeyRejected) else status.HTTP_502_BAD_GATEWAY
    return HTTPException(code, str(exc))


@router.get("", response_model=MapsStatus)
def maps_status(user_id: UserId, db: Db):
    return _status(db, user_id)


@router.put("/key", response_model=MapsStatus)
def connect(body: KeyIn, user_id: UserId, db: Db):
    """Checks the key with Google (one route, one place search), then keeps it encrypted."""
    key = body.api_key.strip()
    try:
        maps_api.check(key)
    except maps_api.MapsError as exc:
        raise _google_failed(exc) from exc
    connection = db.get(ServiceConnection, (user_id, maps_api.PROVIDER))
    if connection is None:
        connection = ServiceConnection(user_id=user_id, provider=maps_api.PROVIDER, url=maps_api.BASE_URL, api_key="")
        db.add(connection)
    connection.api_key = encrypt_secret(key)
    db.commit()
    return _status(db, user_id)


@router.delete("/key", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(user_id: UserId, db: Db):
    """Orbit forgets the key. Places on tasks stay."""
    connection = db.get(ServiceConnection, (user_id, maps_api.PROVIDER))
    if connection is not None:
        db.delete(connection)
        db.commit()
    leave_times.clear_cache()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/places", response_model=list[PlaceOut])
def places(body: PlaceSearch, user_id: UserId, db: Db):
    key = _key(db, user_id)
    try:
        found = maps_api.search(key, body.query.strip(), body.near.point() if body.near else None, body.locale)
    except maps_api.MapsError as exc:
        raise _google_failed(exc) from exc
    return [PlaceOut(id=place.id, name=place.name, address=place.address) for place in found]


@router.post("/leave", response_model=LeaveReply)
def leave(body: LeaveRequest, user_id: UserId, db: Db):
    """The open tasks with a place, due in the next `hours`, and when to leave for each."""
    key = _key(db, user_id)
    now = leave_times.utc_now()
    try:
        items = leave_times.leave_times(
            db, user_id, key, body.origin.point(), body.mode, body.buffer_minutes, now, now + timedelta(hours=body.hours),
            user_zone(db, user_id), body.locale,
        )  # fmt: skip
    except maps_api.MapsError as exc:
        raise _google_failed(exc) from exc
    return LeaveReply(mode=body.mode, buffer_minutes=body.buffer_minutes, checked_at=now, items=[LeaveOut(**vars(item)) for item in items])
