"""One call that returns what the Today and Plan tabs read.

The app builds Today (daily brief, counts) and Plan (week, review, trends) on the phone from this
one bundle, so the shape matches DashboardData in src/lib/types.ts key for key. The lists, sorts
and limits are the ones loadDashboard in src/hooks/use-dashboard-data.tsx asked Supabase for.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import create_model
from sqlalchemy import select

from app import models as m
from app.deps import Db, UserId
from app.schemas.rows import RowModel, row_schema

router = APIRouter(tags=["dashboard"])

# key in DashboardData, model, sort, limit
LISTS: list[tuple[str, type[m.Base], Any, int]] = [
    ("tasks", m.Task, m.Task.created_at.desc(), 80),
    ("reminders", m.Reminder, m.Reminder.remind_at.asc(), 80),
    ("captures", m.Capture, m.Capture.created_at.desc(), 60),
    ("attachments", m.Attachment, m.Attachment.created_at.desc(), 80),
    ("tags", m.Tag, m.Tag.name.asc(), 120),
    ("taggings", m.Tagging, m.Tagging.created_at.desc(), 240),
    ("meals", m.Meal, m.Meal.logged_at.desc(), 80),
    ("mealPlans", m.MealPlan, m.MealPlan.plan_date.desc(), 120),
    ("groceryItems", m.GroceryItem, m.GroceryItem.created_at.desc(), 160),
    ("people", m.Person, m.Person.updated_at.desc(), 120),
    ("weightLogs", m.WeightLog, m.WeightLog.logged_at.desc(), 40),
    ("workouts", m.Workout, m.Workout.logged_at.desc(), 50),
    ("sleepLogs", m.SleepLog, m.SleepLog.sleep_date.desc(), 90),
    ("focusSessions", m.FocusSession, m.FocusSession.started_at.desc(), 120),
    ("habits", m.Habit, m.Habit.created_at.desc(), 60),
    ("habitLogs", m.HabitLog, m.HabitLog.logged_at.desc(), 240),
    ("goals", m.Goal, m.Goal.updated_at.desc(), 60),
    ("goalMilestones", m.GoalMilestone, m.GoalMilestone.created_at.desc(), 240),
    ("journalEntries", m.JournalEntry, m.JournalEntry.entry_date.desc(), 90),
    ("expenses", m.Expense, m.Expense.spent_at.desc(), 120),
    ("bills", m.Bill, m.Bill.due_at.asc(), 80),
]

# Narrower than "everything the user owns", same as before.
FILTERS = {
    "habits": lambda: m.Habit.archived_at.is_(None),
    "goals": lambda: m.Goal.status != "archived",
}

DashboardOut = create_model(
    "Dashboard",
    __base__=RowModel,
    profile=(row_schema(m.Profile) | None, ...),
    **{key: (list[row_schema(model)], ...) for key, model, _, _ in LISTS},
)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user_id: UserId, db: Db):
    data: dict[str, Any] = {"profile": db.get(m.Profile, user_id)}
    for key, model, sort, limit in LISTS:
        query = select(model).where(model.user_id == user_id)
        if key in FILTERS:
            query = query.where(FILTERS[key]())
        data[key] = db.scalars(query.order_by(sort).limit(limit)).all()
    return data
