"""Shapes for medications and the doses taken."""

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from app.models import Medication, MedicationDose
from app.models.medications import DOSE_STATUSES, INTERVAL_HOURS, MAX_TIMES, SCHEDULES, TIME_PATTERN
from app.schemas.rows import RowModel, row_schema
from app.schemas.tasks import Input

Schedule = Literal[SCHEDULES]  # type: ignore[valid-type]
DoseStatus = Literal[DOSE_STATUSES]  # type: ignore[valid-type]
Weekday = Annotated[int, Field(ge=0, le=6)]
Amount = Field(default=None, ge=0, lt=100000)


def _times(value: list[str] | None) -> list[str] | None:
    """Each "HH:MM" once, earliest first, so the same schedule is always stored the same way."""
    if value is None:
        return None
    for item in value:
        if not re.match(TIME_PATTERN, item):
            raise ValueError(f"{item!r} is not a time like 08:00.")
    return sorted(set(value))


def _weekdays(value: list[int] | None) -> list[int] | None:
    return None if value is None else sorted(set(value))


Times = Annotated[list[str], Field(min_length=1, max_length=MAX_TIMES), AfterValidator(_times)]
Weekdays = Annotated[list[Weekday], Field(max_length=7), AfterValidator(_weekdays)]

MedicationRow = row_schema(Medication)
DoseRow = row_schema(MedicationDose)


def _check_schedule(schedule: str | None, weekdays: list[int] | None, every_hours: int | None) -> None:
    if schedule == "weekdays" and weekdays is not None and not weekdays:
        raise ValueError("Pick at least one day.")
    if schedule == "interval" and every_hours is None:
        raise ValueError("Say every how many hours.")
    if every_hours is not None and every_hours not in INTERVAL_HOURS:
        raise ValueError(f"every_hours is one of {', '.join(map(str, INTERVAL_HOURS))}.")


class MedicationCreate(Input):
    name: str = Field(min_length=1, max_length=120)
    dose: str | None = Field(default=None, max_length=60)
    schedule: Schedule = "daily"
    times: Times
    weekdays: Weekdays = []
    every_hours: int | None = None
    # The app sends the phone's own today; left out, the server's.
    starts_on: date = Field(default_factory=date.today)
    ends_on: date | None = None
    paused: bool = False
    stock: float | None = Amount
    per_dose: float = Field(default=1, gt=0, le=100)
    low_stock_at: float | None = Amount
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def valid(self):
        _check_schedule(self.schedule, self.weekdays, self.every_hours)
        if self.schedule != "interval":
            self.every_hours = None
        if self.ends_on is not None and self.ends_on < self.starts_on:
            raise ValueError("The course can't end before it starts.")
        return self


class MedicationUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    dose: str | None = Field(default=None, max_length=60)
    schedule: Schedule | None = None
    times: Times | None = None
    weekdays: Weekdays | None = None
    every_hours: int | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    paused: bool | None = None
    stock: float | None = Amount
    per_dose: float | None = Field(default=None, gt=0, le=100)
    low_stock_at: float | None = Amount
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def valid(self):
        _check_schedule(self.schedule, self.weekdays, self.every_hours)
        return self


class DoseAnswer(Input):
    """Taken or skipped, for one moment of the schedule. Sending it again for the same moment changes the answer."""

    scheduled_at: datetime
    status: DoseStatus = "taken"
    taken_at: datetime | None = None


class DoseResult(RowModel):
    dose: DoseRow  # type: ignore[valid-type]
    medication: MedicationRow  # type: ignore[valid-type]
