"""Medications and the doses taken.

A `medications` row is one medicine and when to take it: `times` are wall-clock times ("08:00") on the phone's own
clock, every day (`daily`), on some weekdays only (`weekdays`, 0 = Monday), or every few hours from a first time
(`interval`, which the app spells out into `times` too). `starts_on` / `ends_on` bound a course; `paused` stops the
reminders without losing anything. `stock` counts what is left (pills, doses); taking a dose takes `per_dose` off it,
and when it falls to `low_stock_at` the phone warns.

The phone works out each dose's moment from that schedule and does the reminding itself. Only a dose someone answered
is stored, in `medication_doses` (taken or skipped), one row per medicine and moment; a moment that passed with no row
is a missed dose. Doses carry user_id and join their medicine on (id, user_id), so they can only hang under the same
owner's medicine.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

SCHEDULES = ("daily", "weekdays", "interval")
DOSE_STATUSES = ("taken", "skipped")
# Every few hours: only steps that fit a day evenly, so the times are the same every day.
INTERVAL_HOURS = (2, 3, 4, 6, 8, 12)
MAX_TIMES = 12
TIME_PATTERN = "^([01][0-9]|2[0-3]):[0-5][0-9]$"


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in values)


_hours_sql = ", ".join(map(str, INTERVAL_HOURS))


class Medication(Owned, Base):
    __tablename__ = "medications"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 120", name="name_length"),
        CheckConstraint("char_length(dose) <= 60", name="dose_length"),
        CheckConstraint("char_length(notes) <= 500", name="notes_length"),
        CheckConstraint(f"schedule in ({_sql_list(SCHEDULES)})", name="schedule"),
        CheckConstraint(f"cardinality(times) between 1 and {MAX_TIMES}", name="times"),
        CheckConstraint("weekdays <@ array[0, 1, 2, 3, 4, 5, 6]", name="weekdays"),
        CheckConstraint("schedule <> 'weekdays' or cardinality(weekdays) >= 1", name="weekdays_set"),
        CheckConstraint(
            f"(schedule = 'interval') = (every_hours is not null) and (every_hours is null or every_hours in ({_hours_sql}))",
            name="every_hours",
        ),
        CheckConstraint("ends_on is null or ends_on >= starts_on", name="course"),
        CheckConstraint("stock is null or (stock >= 0 and stock < 100000)", name="stock"),
        CheckConstraint("per_dose > 0 and per_dose <= 100", name="per_dose"),
        CheckConstraint("low_stock_at is null or (low_stock_at >= 0 and low_stock_at < 100000)", name="low_stock_at"),
        UniqueConstraint("id", "user_id"),
        Index("medications_user_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Free text the person reads, e.g. "500 mg" or "2 drops".
    dose: Mapped[str | None] = mapped_column(Text)
    schedule: Mapped[str] = mapped_column(Text, nullable=False, server_default="daily")
    times: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, server_default=text("'{}'::integer[]"))
    every_hours: Mapped[int | None] = mapped_column(Integer)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    ends_on: Mapped[date | None] = mapped_column(Date)
    paused: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    stock: Mapped[Decimal | None] = mapped_column(Numeric)
    per_dose: Mapped[Decimal] = mapped_column(Numeric, nullable=False, server_default="1")
    low_stock_at: Mapped[Decimal | None] = mapped_column(Numeric)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class MedicationDose(Owned, Base):
    """One answered dose: taken or skipped, for the moment it was due. Goes with its medicine."""

    __tablename__ = "medication_doses"
    __table_args__ = (
        CheckConstraint(f"status in ({_sql_list(DOSE_STATUSES)})", name="status"),
        ForeignKeyConstraint(["medication_id", "user_id"], ["medications.id", "medications.user_id"], ondelete="CASCADE"),
        UniqueConstraint("medication_id", "scheduled_at"),
        Index("medication_doses_user_idx", "user_id", text("scheduled_at desc")),
    )

    medication_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # The moment the dose was due (from the schedule), which is what makes it this dose and not another.
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    # When it was answered.
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = updated_at()
