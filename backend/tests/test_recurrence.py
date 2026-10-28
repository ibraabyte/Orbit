from datetime import UTC, datetime, timedelta, timezone

from app.services.recurrence import add_intervals, next_after, next_recurring_task


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def test_monthly_clamps_to_the_last_day():
    assert add_intervals(utc(2027, 1, 31, 9), "monthly") == utc(2027, 2, 28, 9)
    assert add_intervals(utc(2028, 1, 31, 9), "monthly") == utc(2028, 2, 29, 9)
    assert add_intervals(utc(2026, 12, 15, 9), "monthly") == utc(2027, 1, 15, 9)
    # Each step clamps from the previous result, same as the app's loop.
    assert add_intervals(utc(2027, 1, 31, 9), "monthly", 2) == utc(2027, 3, 28, 9)


def test_next_after_is_strictly_later():
    assert next_after(utc(2026, 10, 1), "weekly", utc(2026, 10, 8)).value == utc(2026, 10, 15)
    result = next_after(utc(2026, 10, 1), "daily", utc(2026, 10, 3, 12))
    assert (result.value, result.intervals) == (utc(2026, 10, 4), 3)


def test_reminder_without_due_date_still_repeats():
    following = next_recurring_task(None, utc(2026, 10, 1, 8), "weekly", utc(2026, 10, 2))
    assert following.due_at is None
    assert following.reminder_at == utc(2026, 10, 8, 8)


def test_no_recurrence_or_dates_means_no_next_task():
    assert next_recurring_task(utc(2026, 10, 1), None, None, utc(2026, 10, 2)) is None
    assert next_recurring_task(None, None, "daily", utc(2026, 10, 2)) is None


def test_monthly_steps_on_the_utc_calendar_day():
    # 31 Jan 01:00 in Riyadh is 30 Jan 22:00 UTC, so the app (which steps in UTC) lands on 28 Feb 22:00 UTC.
    riyadh = timezone(timedelta(hours=3))
    following = next_recurring_task(datetime(2027, 1, 31, 1, tzinfo=riyadh), None, "monthly", utc(2027, 1, 1))
    assert following.due_at == utc(2027, 2, 28, 22)
