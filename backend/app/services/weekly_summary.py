"""The Friday summary: one week of this user's data, as plain numbers for the app and a compact JSON for their own AI.

A week is the seven local days that end on `end` (the app sends the latest Friday). Only titles, names, amounts, counts
and dates go out: never notes, URLs, card digits, ids or credentials. Every list is capped and every text cut.
"""

import json
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from statistics import fmean
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Bill, Budget, Capture, Expense, Meal, Profile, SleepLog, Task, Workout
from app.services import whoop_analytics

WEEK_DAYS = 7
LIST_LIMIT = 8
TEXT_MAX = 100
SUMMARY_WORDS = 120
PLAN_ITEMS = 4
PLAN_WORDS = 20


def zone_of(db: Session, user_id: uuid.UUID) -> ZoneInfo:
    profile = db.get(Profile, user_id)
    try:
        return ZoneInfo(profile.timezone) if profile and profile.timezone else ZoneInfo("UTC")
    except (KeyError, ValueError):
        return ZoneInfo("UTC")


def _cut(text: str) -> str:
    return text if len(text) <= TEXT_MAX else text[: TEXT_MAX - 1] + "…"


def _midnight(day: date, zone: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, zone)


def _day(moment: datetime, zone: ZoneInfo) -> str:
    return moment.astimezone(zone).date().isoformat()


def _avg(values: list[float]) -> float | None:
    return round(fmean(values), 1) if values else None


def _money(totals: dict[str, Decimal]) -> list[dict[str, Any]]:
    return [{"currency": currency, "total": float(total)} for currency, total in sorted(totals.items())]


def week_data(db: Session, user_id: uuid.UUID, end: date) -> tuple[dict[str, Any], dict[str, Any]]:
    """(facts, context): facts are the numbers the app shows as they are; context is what the AI reads."""
    zone = zone_of(db, user_id)
    profile = db.get(Profile, user_id)
    first = end - timedelta(days=WEEK_DAYS - 1)
    start, stop = _midnight(first, zone), _midnight(end + timedelta(days=1), zone)
    next_stop = _midnight(end + timedelta(days=WEEK_DAYS + 1), zone)
    end_day = _midnight(end, zone)

    def capped(query, limit: int = LIST_LIMIT) -> tuple[list, int]:
        rows = list(db.scalars(query.limit(limit)))
        total = len(rows) if len(rows) < limit else db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
        return rows, total

    mine = Task.user_id == user_id
    done, done_total = capped(
        select(Task).where(mine, Task.status == "done", Task.updated_at >= start, Task.updated_at < stop).order_by(Task.updated_at.desc())
    )
    # Overdue going into the last day of the week, so the count does not change during that day.
    late, late_total = capped(
        select(Task).where(mine, Task.status == "open", Task.due_at < end_day).order_by(Task.due_at.desc())
    )  # fmt: skip
    coming, coming_total = capped(
        select(Task).where(mine, Task.status == "open", Task.due_at >= stop, Task.due_at < next_stop).order_by(Task.due_at)
    )

    workouts = list(db.scalars(select(Workout).where(Workout.user_id == user_id, Workout.logged_at >= start, Workout.logged_at < stop)))
    workout_minutes = sum(w.duration_minutes or 0 for w in workouts)
    sleep = list(db.scalars(select(SleepLog).where(SleepLog.user_id == user_id, SleepLog.sleep_date >= first, SleepLog.sleep_date <= end)))
    whoop_days = whoop_analytics.load_summary(db, user_id, today=end, days=WEEK_DAYS)["daily"]
    recovery = _avg([row["recovery"] for row in whoop_days if row["recovery"] is not None])
    whoop_sleep = [row["sleep_hours"] for row in whoop_days if row["sleep_hours"] is not None]
    sleep_hours = _avg([s.duration_minutes / 60 for s in sleep]) if sleep else _avg(whoop_sleep)
    whoop_workouts = sum(row["workouts"] for row in whoop_days)

    calories: dict[date, int] = defaultdict(int)
    for meal in db.scalars(select(Meal).where(Meal.user_id == user_id, Meal.logged_at >= start, Meal.logged_at < stop)):
        calories[meal.logged_at.astimezone(zone).date()] += meal.calories

    def spending(since: datetime, until: datetime) -> tuple[dict[str, Decimal], dict[tuple[str, str], Decimal]]:
        by_currency: dict[str, Decimal] = defaultdict(Decimal)
        by_category: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
        for expense in db.scalars(select(Expense).where(Expense.user_id == user_id, Expense.spent_at >= since, Expense.spent_at < until)):
            by_currency[expense.currency] += expense.amount
            by_category[(expense.category, expense.currency)] += expense.amount
        return by_currency, by_category

    spent, categories = spending(start, stop)
    before, _ = spending(_midnight(first - timedelta(days=WEEK_DAYS), zone), start)
    bills, bills_total = capped(
        select(Bill)
        .where(Bill.user_id == user_id, Bill.status == "active", Bill.due_at > end, Bill.due_at <= end + timedelta(days=WEEK_DAYS))
        .order_by(Bill.due_at)
    )
    month = end.replace(day=1)
    month_spent, month_by_category = spending(_midnight(month, zone), stop)
    budgets = [
        {
            "category": b.category,
            "spent": float(month_by_category.get((b.category, b.currency), Decimal(0))),
            "limit": float(b.amount),
            "currency": b.currency,
        }
        for b in db.scalars(select(Budget).where(Budget.user_id == user_id, Budget.month == month).order_by(Budget.category))
    ]

    links, links_total = capped(
        select(Capture)
        .where(Capture.user_id == user_id, Capture.created_at >= start, Capture.created_at < stop)
        .order_by(Capture.created_at.desc())
    )

    facts = {
        "start": first.isoformat(),
        "end": end.isoformat(),
        "tasks_done": done_total,
        "tasks_overdue": late_total,
        "tasks_next_week": coming_total,
        "workouts": len(workouts) or whoop_workouts,
        "workout_minutes": workout_minutes,
        "workout_target": profile.weekly_workout_minutes_target if profile else None,
        "recovery_avg": recovery,
        "sleep_hours_avg": sleep_hours,
        "calories_avg": round(fmean(calories.values())) if calories else None,
        "calorie_target": profile.daily_calorie_target if profile else None,
        "spent": _money(spent),
        "spent_last_week": _money(before),
        "bills_next_week": bills_total,
        "saved": links_total,
    }
    context = {
        "week": {"from": first.isoformat(), "to": end.isoformat()},
        "facts": facts,
        "done_tasks": [_cut(task.title) for task in done],
        "overdue_tasks": [{"title": _cut(task.title), "due": task.due_at.astimezone(zone).date().isoformat()} for task in late],
        "next_week_tasks": [{"title": _cut(task.title), "due": _day(task.due_at, zone), "priority": task.priority} for task in coming],
        "workouts": [
            {"date": w.logged_at.astimezone(zone).date().isoformat(), "type": _cut(w.type), "minutes": w.duration_minutes} for w in workouts
        ][:LIST_LIMIT],
        "top_spending": [
            {"category": category, "currency": currency, "total": float(total)}
            for (category, currency), total in sorted(categories.items(), key=lambda item: -item[1])[:5]
        ],
        "month_spent": _money(month_spent),
        "budgets": budgets,
        "bills_next_week": [
            {"name": _cut(b.name), "amount": float(b.amount), "currency": b.currency, "due": b.due_at.isoformat()} for b in bills
        ],
        "saved": [{"title": _cut(c.title), "category": c.category} for c in links],
    }
    return facts, context


def _limit(text: str, count: int) -> str:
    words = text.split()
    return text.strip() if len(words) <= count else " ".join(words[:count]) + "…"


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def parse_reply(text: str) -> tuple[str, list[str]]:
    """The AI is asked for {"summary": ..., "plan": [...]}; anything else is kept whole as the summary, with no plan."""
    raw = _FENCE.sub("", text.strip())
    try:
        value = json.loads(raw)
    except ValueError:
        return _limit(text, SUMMARY_WORDS), []
    if not isinstance(value, dict) or not isinstance(value.get("summary"), str) or not value["summary"].strip():
        return _limit(text, SUMMARY_WORDS), []
    plan = value.get("plan")
    items = [item for item in plan if isinstance(item, str) and item.strip()] if isinstance(plan, list) else []
    return _limit(value["summary"], SUMMARY_WORDS), [_limit(item, PLAN_WORDS) for item in items[:PLAN_ITEMS]]
