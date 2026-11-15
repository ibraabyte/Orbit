"""When to leave for the day's appointments: the open tasks with a place and a due time, timed by Google Maps.

For each one: the way from where the phone is now to the place, then leave at = due − travel − buffer. Driving is
asked twice when leaving is still a while off: once for now, then again for the moment of leaving, so the traffic
expected then is used. Transit is asked for the arrival time directly.

Answers are kept in memory for a few minutes per task, place, time, mode and rough position (about 100 m), so opening
the app again does not ask Google again. Nothing about the position is stored.
"""

import time as clock
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ServiceConnection, Task
from app.security import decrypt_secret
from app.services import maps_api
from app.services.maps_api import Mode, Point

# At most this many appointments are timed per look.
LIMIT = 8
# Driving is asked again for the moment of leaving when that is more than this far off.
REFINE_AFTER = timedelta(minutes=20)
CACHE_SECONDS = 10 * 60
CACHE_MAX = 500

Status = Literal["ok", "late", "no_route"]


@dataclass(frozen=True)
class Leave:
    task_id: uuid.UUID
    title: str
    place_name: str
    due_at: datetime
    travel_minutes: int | None
    meters: int | None
    leave_at: datetime | None
    status: Status


_cache: dict[tuple, tuple[float, maps_api.Route | None]] = {}


def utc_now() -> datetime:
    # Replaced in tests.
    return datetime.now(UTC)


def clear_cache() -> None:
    _cache.clear()


def api_key(db: Session, user_id: uuid.UUID) -> str | None:
    connection = db.get(ServiceConnection, (user_id, maps_api.PROVIDER))
    return decrypt_secret(connection.api_key) if connection else None


def _timed(due: datetime, zone: ZoneInfo) -> bool:
    # A due date without a time (local midnight) is not an appointment to travel to.
    local = due.astimezone(zone)
    return (local.hour, local.minute) != (0, 0)


def appointments(db: Session, user_id: uuid.UUID, now: datetime, until: datetime, zone: ZoneInfo) -> list[Task]:
    query = (
        select(Task)
        .where(Task.user_id == user_id, Task.status == "open", Task.place_name.is_not(None), Task.due_at > now, Task.due_at <= until)
        .order_by(Task.due_at)
        .limit(LIMIT * 2)
    )
    return [task for task in db.scalars(query) if _timed(task.due_at, zone)][:LIMIT]


def _way(key: str, task: Task, origin: Point, mode: Mode, now: datetime, buffer: int, language: str) -> maps_api.Route | None:
    assert task.due_at is not None and task.place_name is not None
    near = (round(origin.lat, 3), round(origin.lng, 3))
    cache_key = (task.user_id, task.id, task.place_name, task.place_id, task.due_at, mode, buffer, near)
    hit = _cache.get(cache_key)
    if hit and clock.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    to = maps_api.destination(task.place_name, task.place_id)
    if mode == "transit":
        found = maps_api.route(key, origin, to, mode, arrive_by=task.due_at, language=language)
    else:
        found = maps_api.route(key, origin, to, mode, language=language)
        if found is not None and mode == "drive":
            leave = task.due_at - timedelta(minutes=found.minutes + buffer)
            if leave - now > REFINE_AFTER:
                found = maps_api.route(key, origin, to, mode, depart_at=leave, language=language) or found
    if len(_cache) >= CACHE_MAX:
        _cache.clear()
    _cache[cache_key] = (clock.monotonic(), found)
    return found


def leave_times(
    db: Session,
    user_id: uuid.UUID,
    key: str,
    origin: Point,
    mode: Mode,
    buffer: int,
    now: datetime,
    until: datetime,
    zone: ZoneInfo,
    language: str = "en",
) -> list[Leave]:
    """Raises maps_api.KeyRejected or maps_api.MapsError when Google can't be asked."""
    out: list[Leave] = []
    for task in appointments(db, user_id, now, until, zone):
        assert task.due_at is not None and task.place_name is not None
        way = _way(key, task, origin, mode, now, buffer, language)
        if way is None:
            out.append(Leave(task.id, task.title, task.place_name, task.due_at, None, None, None, "no_route"))
            continue
        leave = task.due_at - timedelta(minutes=way.minutes + buffer)
        state: Status = "late" if leave <= now else "ok"
        out.append(Leave(task.id, task.title, task.place_name, task.due_at, way.minutes, way.meters, leave, state))
    return out
