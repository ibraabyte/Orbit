"""Numbers and trends from the synced WHOOP data: one row per day, averages, and this week against last week.

Each record lands on the local day WHOOP recorded it in (its timezone_offset): a cycle and its recovery
on the day the cycle started, a night's sleep on the day you woke up, a workout on the day it started.
"""

import re
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta, timezone
from statistics import fmean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout

# WHOOP's own recovery bands.
GREEN, YELLOW = 67, 34
HIGH_STRAIN = 14.0
HOUR_MS = 3_600_000

# key, whether higher is better (None: neither, it's context)
METRICS: list[tuple[str, bool | None]] = [
    ("recovery", True),
    ("hrv", True),
    ("resting_hr", False),
    ("strain", None),
    ("sleep_hours", True),
    ("sleep_performance", True),
    ("sleep_efficiency", True),
    ("respiratory_rate", None),
]

_OFFSET = re.compile(r"^([+-])(\d{2}):?(\d{2})$")


def local_day(moment: datetime, offset: str | None) -> date:
    match = _OFFSET.match(offset or "")
    if match:
        sign = 1 if match.group(1) == "+" else -1
        moment = moment.astimezone(timezone(sign * timedelta(hours=int(match.group(2)), minutes=int(match.group(3)))))
    return moment.date()


def recovery_zone(score: float | None) -> str | None:
    if score is None:
        return None
    return "green" if score >= GREEN else "yellow" if score >= YELLOW else "red"


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def _mean(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return fmean(present) if present else None


def build_days(
    cycles: list[WhoopCycle], recoveries: list[WhoopRecovery], sleeps: list[WhoopSleep], workouts: list[WhoopWorkout]
) -> dict[date, dict[str, Any]]:
    days: dict[date, dict[str, Any]] = defaultdict(lambda: {"workouts": 0, "workout_minutes": 0})
    cycle_day = {}
    for cycle in cycles:
        day = local_day(cycle.start, cycle.timezone_offset)
        cycle_day[cycle.whoop_id] = day
        row = days[day]
        row.update(strain=cycle.strain, average_hr=cycle.average_heart_rate, max_hr=cycle.max_heart_rate, kilojoule=cycle.kilojoule)
    for recovery in recoveries:
        day = cycle_day.get(recovery.cycle_id)
        if day is None or recovery.recovery_score is None:
            continue
        days[day].update(
            recovery=recovery.recovery_score,
            hrv=recovery.hrv_rmssd_milli,
            resting_hr=recovery.resting_heart_rate,
            spo2=recovery.spo2_percentage,
            skin_temp=recovery.skin_temp_celsius,
        )
    # The main sleep of the night: the longest non-nap that ended on that day.
    for sleep in sorted((s for s in sleeps if not s.nap and s.in_bed_milli is not None), key=lambda s: s.in_bed_milli or 0):
        asleep = (sleep.in_bed_milli or 0) - (sleep.awake_milli or 0)
        days[local_day(sleep.end, sleep.timezone_offset)].update(
            sleep_hours=asleep / HOUR_MS,
            sleep_need_hours=sleep.sleep_need_milli / HOUR_MS if sleep.sleep_need_milli else None,
            sleep_performance=sleep.performance_percentage,
            sleep_efficiency=sleep.efficiency_percentage,
            sleep_consistency=sleep.consistency_percentage,
            respiratory_rate=sleep.respiratory_rate,
            deep_hours=(sleep.slow_wave_milli or 0) / HOUR_MS,
            rem_hours=(sleep.rem_milli or 0) / HOUR_MS,
        )
    for workout in workouts:
        row = days[local_day(workout.start, workout.timezone_offset)]
        row["workouts"] += 1
        row["workout_minutes"] += round((workout.end - workout.start).total_seconds() / 60)
    return days


DAY_FIELDS = (
    "recovery", "hrv", "resting_hr", "spo2", "skin_temp", "strain", "average_hr", "max_hr", "kilojoule",
    "sleep_hours", "sleep_need_hours", "sleep_performance", "sleep_efficiency", "sleep_consistency",
    "respiratory_rate", "deep_hours", "rem_hours",
)  # fmt: skip


def _metric(days: list[dict[str, Any]], key: str, higher_is_better: bool | None) -> dict[str, Any]:
    last7 = _mean([day.get(key) for day in days[-7:]])
    prev7 = _mean([day.get(key) for day in days[-14:-7]])
    change = None if last7 is None or prev7 is None else last7 - prev7
    return {
        "key": key,
        "average": _round(_mean([day.get(key) for day in days])),
        "last7": _round(last7),
        "prev7": _round(prev7),
        "change": _round(change),
        "higher_is_better": higher_is_better,
    }


def _strain_vs_next_recovery(days: dict[date, dict[str, Any]]) -> dict[str, Any]:
    """Average recovery the morning after a hard day (strain >= 14) compared with after an easier one."""
    after_hard, after_easy = [], []
    for day, row in days.items():
        strain, next_recovery = row.get("strain"), days.get(day + timedelta(days=1), {}).get("recovery")
        if strain is None or next_recovery is None:
            continue
        (after_hard if strain >= HIGH_STRAIN else after_easy).append(next_recovery)
    return {
        "high_strain_threshold": HIGH_STRAIN,
        "after_high_strain": _round(_mean(after_hard)),
        "after_lower_strain": _round(_mean(after_easy)),
        "high_strain_days": len(after_hard),
    }


def summarize(
    cycles: list[WhoopCycle],
    recoveries: list[WhoopRecovery],
    sleeps: list[WhoopSleep],
    workouts: list[WhoopWorkout],
    *,
    today: date,
    days: int,
) -> dict[str, Any]:
    by_day = build_days(cycles, recoveries, sleeps, workouts)
    first = today - timedelta(days=days - 1)
    series = []
    for offset in range(days):
        day = first + timedelta(days=offset)
        row = by_day.get(day, {})
        series.append(
            {
                "date": day.isoformat(),
                **{field: _round(row.get(field)) for field in DAY_FIELDS},
                "recovery_zone": recovery_zone(row.get("recovery")),
                "workouts": row.get("workouts", 0),
                "workout_minutes": row.get("workout_minutes", 0),
            }
        )

    latest = {}
    for key in ("recovery", "hrv", "resting_hr", "strain", "sleep_hours", "sleep_performance"):
        found = next((row for row in reversed(series) if row[key] is not None), None)
        latest[key] = {"value": found[key], "date": found["date"]} if found else None

    zones = {"green": 0, "yellow": 0, "red": 0}
    for row in series:
        if row["recovery_zone"]:
            zones[row["recovery_zone"]] += 1

    in_range = [w for w in workouts if first <= local_day(w.start, w.timezone_offset) <= today]
    sports: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "minutes": 0, "strain": 0.0})
    for workout in in_range:
        sport = sports[workout.sport_name or "activity"]
        sport["count"] += 1
        sport["minutes"] += round((workout.end - workout.start).total_seconds() / 60)
        sport["strain"] += workout.strain or 0
    by_sport = sorted(
        ({"sport": name, **values, "strain": round(values["strain"], 1)} for name, values in sports.items()),
        key=lambda item: (-item["minutes"], item["sport"]),
    )

    return {
        "days": days,
        "start": first.isoformat(),
        "end": today.isoformat(),
        "has_data": any(row[key] is not None for row in series for key in ("recovery", "strain", "sleep_hours")),
        "latest": latest,
        "daily": series,
        "metrics": [_metric(series, key, better) for key, better in METRICS],
        "recovery_zones": zones,
        "workouts": {
            "count": len(in_range),
            "minutes": sum(item["minutes"] for item in by_sport),
            "strain": round(sum(w.strain or 0 for w in in_range), 1),
            "by_sport": by_sport,
        },
        "strain_vs_recovery": _strain_vs_next_recovery(by_day),
    }


def load_summary(db: Session, user_id: uuid.UUID, *, today: date, days: int) -> dict[str, Any]:
    # A day of slack on both sides: local days can start before or after the UTC day.
    since = datetime.combine(today - timedelta(days=days + 1), datetime.min.time(), tzinfo=UTC)

    def rows(model: Any) -> list[Any]:
        return list(db.scalars(select(model).where(model.user_id == user_id, model.start >= since)))

    cycles = rows(WhoopCycle)
    recoveries = list(
        db.scalars(select(WhoopRecovery).where(WhoopRecovery.user_id == user_id, WhoopRecovery.cycle_id.in_([c.whoop_id for c in cycles])))
    )
    return summarize(cycles, recoveries, rows(WhoopSleep), rows(WhoopWorkout), today=today, days=days)
