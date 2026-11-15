"""Apple Health: the phone reads HealthKit, adds each local day up and sends the days here.

There is no sign-in with Apple's servers: HealthKit lives only on the iPhone, so "connected" means this user's phone
has sent days. Disconnecting deletes them; Health access itself is switched off in the iPhone's Settings.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.deps import Db, UserId
from app.models import AppleHealthDay
from app.routers.plan import user_today

router = APIRouter(prefix="/apple-health", tags=["apple-health"])

# The phone sends the last couple of weeks each time; a first sync may go back further.
MAX_DAYS = 120


class DayIn(BaseModel):
    date: date
    steps: int | None = Field(None, ge=0, le=200_000)
    active_kcal: float | None = Field(None, ge=0, le=20_000)
    sleep_minutes: int | None = Field(None, ge=0, le=24 * 60)
    workouts: int | None = Field(None, ge=0, le=100)
    workout_minutes: int | None = Field(None, ge=0, le=24 * 60)
    resting_hr: float | None = Field(None, ge=20, le=250)
    average_hr: float | None = Field(None, ge=20, le=250)
    hrv_sdnn: float | None = Field(None, ge=0, le=500)
    weight_kg: float | None = Field(None, ge=10, le=500)


class DaysIn(BaseModel):
    days: list[DayIn] = Field(max_length=MAX_DAYS)


class DayOut(DayIn):
    model_config = ConfigDict(from_attributes=True)


class AppleHealthStatus(BaseModel):
    connected: bool
    last_synced_at: datetime | None = None


def _status(db: Db, user_id: UserId) -> AppleHealthStatus:
    last = db.scalar(select(func.max(AppleHealthDay.updated_at)).where(AppleHealthDay.user_id == user_id))
    return AppleHealthStatus(connected=last is not None, last_synced_at=last)


@router.get("/status", response_model=AppleHealthStatus)
def apple_health_status(user_id: UserId, db: Db):
    return _status(db, user_id)


@router.put("/days", response_model=AppleHealthStatus)
def save_days(user_id: UserId, db: Db, body: DaysIn):
    """Replaces each sent day (a missing number becomes empty: the phone sends the whole day every time)."""
    today = user_today(db, user_id)
    # A phone a timezone ahead may already be on tomorrow; anything further is a wrong clock.
    if any(day.date > today + timedelta(days=1) for day in body.days):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A day is in the future.")
    if body.days:
        # The last copy of a date wins, so a repeated date can't make the insert fail.
        values = list({day.date: {**day.model_dump(), "user_id": user_id} for day in body.days}.values())
        statement = insert(AppleHealthDay).values(values)
        columns = {name: statement.excluded[name] for name in DayIn.model_fields if name != "date"}
        db.execute(statement.on_conflict_do_update(index_elements=["user_id", "date"], set_={**columns, "updated_at": func.now()}))
        db.commit()
    return _status(db, user_id)


@router.get("/days", response_model=list[DayOut])
def list_days(user_id: UserId, db: Db, days: int = Query(14, ge=1, le=MAX_DAYS)):
    """The last `days` days up to today, oldest first."""
    since = user_today(db, user_id) - timedelta(days=days - 1)
    query = select(AppleHealthDay).where(AppleHealthDay.user_id == user_id, AppleHealthDay.date >= since).order_by(AppleHealthDay.date)
    return db.scalars(query).all()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(user_id: UserId, db: Db):
    db.execute(delete(AppleHealthDay).where(AppleHealthDay.user_id == user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
