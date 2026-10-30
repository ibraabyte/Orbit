"""Everything the signed-in user owns, as one JSON download.

Keys and order match EXPORT_TABLES in src/lib/export.ts, so the app builds its backup file and CSVs from
this without reshaping. Push subscription secrets are never sent back.
"""

from typing import Any

from fastapi import APIRouter
from sqlalchemy import select

from app import models as m
from app.deps import Db, UserId
from app.schemas.rows import row_schema

router = APIRouter(tags=["export"])

# key, model, sort
TABLES: list[tuple[str, type[m.Base], Any]] = [
    ("tasks", m.Task, m.Task.created_at),
    ("reminders", m.Reminder, m.Reminder.created_at),
    ("captures", m.Capture, m.Capture.created_at),
    ("attachments", m.Attachment, m.Attachment.created_at),
    ("tags", m.Tag, m.Tag.created_at),
    ("taggings", m.Tagging, m.Tagging.created_at),
    ("meals", m.Meal, m.Meal.logged_at),
    ("meal_plans", m.MealPlan, m.MealPlan.plan_date),
    ("grocery_items", m.GroceryItem, m.GroceryItem.created_at),
    ("people", m.Person, m.Person.name),
    ("weight_logs", m.WeightLog, m.WeightLog.logged_at),
    ("workouts", m.Workout, m.Workout.logged_at),
    ("sleep_logs", m.SleepLog, m.SleepLog.sleep_date),
    ("focus_sessions", m.FocusSession, m.FocusSession.started_at),
    ("expenses", m.Expense, m.Expense.spent_at),
    ("bills", m.Bill, m.Bill.due_at),
    ("push_subscriptions", m.PushSubscription, m.PushSubscription.created_at),
    ("habits", m.Habit, m.Habit.created_at),
    ("habit_logs", m.HabitLog, m.HabitLog.logged_at),
    ("goals", m.Goal, m.Goal.created_at),
    ("goal_milestones", m.GoalMilestone, m.GoalMilestone.created_at),
    ("journal_entries", m.JournalEntry, m.JournalEntry.entry_date),
    ("vehicles", m.Vehicle, m.Vehicle.created_at),
    ("watch_items", m.WatchItem, m.WatchItem.created_at),
]

REDACTED = {"push_subscriptions": ("endpoint", "p256dh", "auth")}


def _rows(model: type[m.Base], rows: Any, table: str) -> list[dict[str, Any]]:
    schema = row_schema(model)
    out = [schema.model_validate(row).model_dump(mode="json") for row in rows]
    for row in out:
        for key in REDACTED.get(table, ()):
            row[key] = "[redacted]"
    return out


@router.get("/export")
def export(user_id: UserId, db: Db) -> dict[str, list[dict[str, Any]]]:
    profile = db.get(m.Profile, user_id)
    data = {"profiles": _rows(m.Profile, [profile] if profile else [], "profiles")}
    for table, model, sort in TABLES:
        rows = db.scalars(select(model).where(model.user_id == user_id).order_by(sort, model.id))
        data[table] = _rows(model, rows, table)
    return data
