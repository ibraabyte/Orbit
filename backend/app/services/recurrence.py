"""Port of src/lib/recurrence.ts, so a repeating task rolls forward the same way on the server."""

import calendar
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


def add_single(value: datetime, recurrence: str) -> datetime:
    if recurrence == "daily":
        return value + timedelta(days=1)
    if recurrence == "weekly":
        return value + timedelta(days=7)
    # Monthly keeps the day of month, clamped to the month's last day (Jan 31 -> Feb 28).
    year, month = (value.year + 1, 1) if value.month == 12 else (value.year, value.month + 1)
    return value.replace(year=year, month=month, day=min(value.day, calendar.monthrange(year, month)[1]))


def add_intervals(value: datetime | None, recurrence: str | None, intervals: int = 1) -> datetime | None:
    if value is None or not recurrence:
        return None
    for _ in range(max(1, intervals)):
        value = add_single(value, recurrence)
    return value


@dataclass(frozen=True)
class NextDate:
    value: datetime
    intervals: int


def next_after(value: datetime | None, recurrence: str | None, after: datetime) -> NextDate | None:
    """The first repeat strictly after `after`, and how many steps it took to get there."""
    if value is None or not recurrence:
        return None
    intervals = 0
    while True:
        intervals += 1
        value = add_single(value, recurrence)
        if value > after:
            return NextDate(value, intervals)


@dataclass(frozen=True)
class NextTask:
    due_at: datetime | None
    reminder_at: datetime | None


def next_recurring_task(due_at: datetime | None, reminder_at: datetime | None, recurrence: str | None, after: datetime) -> NextTask | None:
    if not recurrence:
        return None
    # Step in UTC like the app does, so "monthly" lands on the same calendar day either way.
    due_at, reminder_at = (v.astimezone(UTC) if v else None for v in (due_at, reminder_at))
    next_due = next_after(due_at, recurrence, after)
    # The reminder moves by as many steps as the due date did, so it keeps its lead time.
    reminder_steps = next_due.intervals if next_due else (n.intervals if (n := next_after(reminder_at, recurrence, after)) else None)
    next_reminder = add_intervals(reminder_at, recurrence, reminder_steps) if reminder_at and reminder_steps else None
    if next_due is None and next_reminder is None:
        return None
    return NextTask(due_at=next_due.value if next_due else None, reminder_at=next_reminder)
