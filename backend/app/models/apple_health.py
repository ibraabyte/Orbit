"""Apple Health: one row per user per local day, sent by the phone.

The phone reads HealthKit (iPhone, Apple Watch and every app that writes to Health) and adds each day up itself, so
HealthKit's own de-duplication between sources applies. The server only keeps the totals; a re-sync replaces a day.
"""

from datetime import date, datetime

from sqlalchemy import Date, Float, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


class AppleHealthDay(Owned, Base):
    __tablename__ = "apple_health_days"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    steps: Mapped[int | None] = mapped_column(Integer)
    active_kcal: Mapped[float | None] = mapped_column(Float)
    # Asleep (not just in bed), for the night that ended on this morning.
    sleep_minutes: Mapped[int | None] = mapped_column(Integer)
    workouts: Mapped[int | None] = mapped_column(Integer)
    workout_minutes: Mapped[int | None] = mapped_column(Integer)
    resting_hr: Mapped[float | None] = mapped_column(Float)
    average_hr: Mapped[float | None] = mapped_column(Float)
    # Apple's HRV is SDNN in ms (WHOOP's is RMSSD), so the two aren't mixed.
    hrv_sdnn: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime] = updated_at()
