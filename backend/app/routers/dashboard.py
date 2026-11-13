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
    # Open tasks first, so finished ones never push an open one out of the bundle.
    ("tasks", m.Task, (m.Task.status != "open", m.Task.created_at.desc()), 300),
    ("taskLists", m.TaskList, m.TaskList.position.asc(), 100),
    ("taskSteps", m.TaskStep, (m.TaskStep.task_id, m.TaskStep.position), 1000),
    ("reminders", m.Reminder, m.Reminder.remind_at.asc(), 80),
    ("captures", m.Capture, m.Capture.created_at.desc(), 60),
    ("attachments", m.Attachment, m.Attachment.created_at.desc(), 80),
    ("tags", m.Tag, m.Tag.name.asc(), 120),
    ("taggings", m.Tagging, m.Tagging.created_at.desc(), 240),
    ("meals", m.Meal, m.Meal.logged_at.desc(), 80),
    ("mealPlans", m.MealPlan, m.MealPlan.plan_date.desc(), 120),
    ("groceryItems", m.GroceryItem, m.GroceryItem.created_at.desc(), 160),
    ("weightLogs", m.WeightLog, m.WeightLog.logged_at.desc(), 40),
    ("workouts", m.Workout, m.Workout.logged_at.desc(), 50),
    ("sleepLogs", m.SleepLog, m.SleepLog.sleep_date.desc(), 90),
    ("habits", m.Habit, m.Habit.created_at.desc(), 60),
    ("medications", m.Medication, m.Medication.created_at.asc(), 100),
    # The last few weeks of answered doses: enough for the log and for knowing which of today's are done.
    ("medicationDoses", m.MedicationDose, m.MedicationDose.scheduled_at.desc(), 600),
    ("habitLogs", m.HabitLog, m.HabitLog.logged_at.desc(), 240),
    # ponytail: budgets add up these rows on the phone, so a very heavy spender (over 1000 expenses) is undercounted;
    # the upgrade is a server-side month total per category.
    ("expenses", m.Expense, m.Expense.spent_at.desc(), 1000),
    ("bills", m.Bill, m.Bill.due_at.asc(), 80),
    ("budgets", m.Budget, m.Budget.month.desc(), 240),
    ("cards", m.Card, m.Card.created_at.asc(), 60),
    ("moneyAccounts", m.MoneyAccount, m.MoneyAccount.created_at.asc(), 60),
    ("investments", m.Investment, m.Investment.created_at.asc(), 100),
    ("obligations", m.Obligation, m.Obligation.created_at.asc(), 60),
    # ponytail: every installment of every plan; a 30-year monthly loan is 360 rows, so 1000 covers a few.
    ("obligationInstallments", m.ObligationInstallment, m.ObligationInstallment.due_on.asc(), 1000),
]

# Narrower than "everything the user owns", same as before.
FILTERS = {
    "habits": lambda user_id: m.Habit.archived_at.is_(None),
    # Only the checklists of open tasks; a finished task's steps are history.
    "taskSteps": lambda user_id: m.TaskStep.task_id.in_(select(m.Task.id).where(m.Task.user_id == user_id, m.Task.status == "open")),
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
            query = query.where(FILTERS[key](user_id))
        order = sort if isinstance(sort, tuple) else (sort,)
        data[key] = db.scalars(query.order_by(*order, model.id).limit(limit)).all()
    return data
