"""Input shapes for every owner-scoped table that isn't tasks or reminders.

Create bodies list what the app sends; update bodies make every field optional (PATCH). user_id, id and
timestamps are never accepted from the client. The limits mirror the database's check constraints, so a bad
value is refused with a clear message before it reaches Postgres.
"""

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import Field

from app.models.finance import FINANCE_CATEGORIES
from app.models.library import TAGGING_TARGETS
from app.schemas.tasks import Input


def name_field(default=...):
    return Field(default, min_length=1, max_length=220)


TagNames = Field(default_factory=list, max_length=20)

FinanceCategory = Literal[FINANCE_CATEGORIES]  # type: ignore[valid-type]
TaggingTarget = Literal[TAGGING_TARGETS]  # type: ignore[valid-type]


class Tagged(Input):
    # Tag names to attach in the same call; missing tags are created.
    tags: list[str] = TagNames


# Tags


class TagCreate(Input):
    name: str = Field(min_length=1, max_length=60)
    color: str | None = None


class TagUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = None


class TaggingCreate(Input):
    tag_id: uuid.UUID
    target_type: TaggingTarget
    target_id: uuid.UUID


class TagNamesIn(Input):
    names: list[str] = Field(max_length=20)


# Library


class CaptureCreate(Tagged):
    type: Literal["link", "screenshot", "note"] = "link"
    url: str | None = None
    title: str = Field(min_length=1, max_length=280)
    note: str | None = None
    source: str | None = None


class CaptureUpdate(Input):
    type: Literal["link", "screenshot", "note"] | None = None
    url: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=280)
    note: str | None = None
    source: str | None = None


# Food


class MealCreate(Tagged):
    name: str = name_field()
    calories: int = Field(default=0, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    logged_at: datetime


class MealUpdate(Input):
    name: str | None = name_field(None)
    calories: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    logged_at: datetime | None = None


MealType = Literal["breakfast", "lunch", "dinner", "snack", "other"]
MealPlanStatus = Literal["planned", "prepped", "eaten", "skipped"]


class MealPlanCreate(Tagged):
    name: str = name_field()
    plan_date: date
    meal_type: MealType = "other"
    calories: int = Field(default=0, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    note: str | None = None
    status: MealPlanStatus = "planned"


class MealPlanUpdate(Input):
    name: str | None = name_field(None)
    plan_date: date | None = None
    meal_type: MealType | None = None
    calories: int | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    note: str | None = None
    status: MealPlanStatus | None = None


GroceryCategory = Literal["produce", "protein", "dairy", "pantry", "frozen", "household", "other"]
GroceryStatus = Literal["needed", "bought", "skipped"]


class GroceryItemCreate(Tagged):
    meal_plan_id: uuid.UUID | None = None
    name: str = name_field()
    quantity: str | None = None
    category: GroceryCategory = "other"
    status: GroceryStatus = "needed"
    due_at: date | None = None


class GroceryItemUpdate(Input):
    meal_plan_id: uuid.UUID | None = None
    name: str | None = name_field(None)
    quantity: str | None = None
    category: GroceryCategory | None = None
    status: GroceryStatus | None = None
    due_at: date | None = None


# Health


class WeightLogCreate(Input):
    weight: float = Field(gt=0, lt=1000)
    unit: Literal["kg", "lb"] = "kg"
    logged_at: datetime


class WeightLogUpdate(Input):
    weight: float | None = Field(default=None, gt=0, lt=1000)
    unit: Literal["kg", "lb"] | None = None
    logged_at: datetime | None = None


class WorkoutCreate(Tagged):
    type: str = Field(min_length=1, max_length=160)
    duration_minutes: int | None = Field(default=None, ge=0)
    calories: int | None = Field(default=None, ge=0)
    notes: str | None = None
    logged_at: datetime


class WorkoutUpdate(Input):
    type: str | None = Field(default=None, min_length=1, max_length=160)
    duration_minutes: int | None = Field(default=None, ge=0)
    calories: int | None = Field(default=None, ge=0)
    notes: str | None = None
    logged_at: datetime | None = None


class SleepLogCreate(Tagged):
    sleep_date: date
    duration_minutes: int = Field(ge=0, le=1440)
    quality: int | None = Field(default=None, ge=1, le=5)
    bedtime_at: datetime | None = None
    woke_at: datetime | None = None
    note: str | None = None


class SleepLogUpdate(Input):
    sleep_date: date | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=1440)
    quality: int | None = Field(default=None, ge=1, le=5)
    bedtime_at: datetime | None = None
    woke_at: datetime | None = None
    note: str | None = None


FocusStatus = Literal["planned", "completed", "cancelled"]


class FocusSessionCreate(Tagged):
    task_id: uuid.UUID | None = None
    title: str = name_field()
    duration_minutes: int = Field(ge=0, le=1440)
    started_at: datetime
    ended_at: datetime | None = None
    status: FocusStatus = "completed"
    energy: int | None = Field(default=None, ge=1, le=5)
    note: str | None = None


class FocusSessionUpdate(Input):
    task_id: uuid.UUID | None = None
    title: str | None = name_field(None)
    duration_minutes: int | None = Field(default=None, ge=0, le=1440)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    status: FocusStatus | None = None
    energy: int | None = Field(default=None, ge=1, le=5)
    note: str | None = None


# Habits, goals, journal, people


class HabitCreate(Input):
    name: str = Field(min_length=1, max_length=180)
    frequency: Literal["daily", "weekly"] = "daily"
    target_count: int = Field(default=1, gt=0, le=21)
    color: str | None = None


class HabitUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    frequency: Literal["daily", "weekly"] | None = None
    target_count: int | None = Field(default=None, gt=0, le=21)
    color: str | None = None
    archived_at: datetime | None = None


class HabitLogCreate(Input):
    habit_id: uuid.UUID
    logged_at: datetime | None = None
    note: str | None = None


class HabitLogUpdate(Input):
    logged_at: datetime | None = None
    note: str | None = None


GoalStatus = Literal["active", "completed", "archived"]


class GoalCreate(Input):
    title: str = name_field()
    notes: str | None = None
    status: GoalStatus = "active"
    target_at: date | None = None


class GoalUpdate(Input):
    title: str | None = name_field(None)
    notes: str | None = None
    status: GoalStatus | None = None
    target_at: date | None = None


class GoalMilestoneCreate(Input):
    goal_id: uuid.UUID
    title: str = name_field()
    completed_at: datetime | None = None


class GoalMilestoneUpdate(Input):
    title: str | None = name_field(None)
    completed_at: datetime | None = None


Mood = Literal["great", "good", "neutral", "low", "bad"]


class JournalEntryCreate(Input):
    mood: Mood = "neutral"
    title: str | None = Field(default=None, max_length=220)
    body: str = Field(min_length=1)
    entry_date: date


class JournalEntryUpdate(Input):
    mood: Mood | None = None
    title: str | None = Field(default=None, max_length=220)
    body: str | None = Field(default=None, min_length=1)
    entry_date: date | None = None


class JournalDayIn(Input):
    mood: Mood = "neutral"
    title: str | None = Field(default=None, max_length=220)
    body: str = Field(min_length=1)


class PersonCreate(Input):
    name: str = name_field()
    relationship: str | None = None
    contact_method: str | None = None
    birthday: date | None = None
    last_contacted_at: date | None = None
    next_follow_up_at: date | None = None
    notes: str | None = None
    favorite: bool = False


class PersonUpdate(Input):
    name: str | None = name_field(None)
    relationship: str | None = None
    contact_method: str | None = None
    birthday: date | None = None
    last_contacted_at: date | None = None
    next_follow_up_at: date | None = None
    notes: str | None = None
    favorite: bool | None = None


# Money


class ExpenseCreate(Tagged):
    merchant: str = name_field()
    amount: float = Field(ge=0, lt=10**10)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    category: FinanceCategory = "other"
    note: str | None = None
    spent_at: datetime


class ExpenseUpdate(Input):
    merchant: str | None = name_field(None)
    amount: float | None = Field(default=None, ge=0, lt=10**10)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category: FinanceCategory | None = None
    note: str | None = None
    spent_at: datetime | None = None


BillRecurrence = Literal["once", "weekly", "monthly", "yearly"]
BillStatus = Literal["active", "paid", "paused"]


class BillCreate(Tagged):
    name: str = name_field()
    amount: float = Field(ge=0, lt=10**10)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    category: FinanceCategory = "subscriptions"
    due_at: date
    recurrence: BillRecurrence = "monthly"
    status: BillStatus = "active"
    autopay: bool = False
    note: str | None = None


class BillUpdate(Input):
    name: str | None = name_field(None)
    amount: float | None = Field(default=None, ge=0, lt=10**10)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    category: FinanceCategory | None = None
    due_at: date | None = None
    recurrence: BillRecurrence | None = None
    status: BillStatus | None = None
    autopay: bool | None = None
    note: str | None = None


# Car and watch list


class VehicleCreate(Input):
    name: str = Field(min_length=1, max_length=120)
    plate: str | None = Field(default=None, max_length=20)
    odometer_km: int | None = Field(default=None, ge=0)
    registration_expires_at: date | None = None
    insurance_expires_at: date | None = None
    inspection_expires_at: date | None = None
    next_oil_change_at: date | None = None
    next_oil_change_km: int | None = Field(default=None, ge=0)
    notes: str | None = None


class VehicleUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    plate: str | None = Field(default=None, max_length=20)
    odometer_km: int | None = Field(default=None, ge=0)
    registration_expires_at: date | None = None
    insurance_expires_at: date | None = None
    inspection_expires_at: date | None = None
    next_oil_change_at: date | None = None
    next_oil_change_km: int | None = Field(default=None, ge=0)
    notes: str | None = None


WatchStatus = Literal["want", "watching", "done"]


class WatchItemCreate(Input):
    tmdb_id: int = Field(gt=0)
    media_type: Literal["movie", "tv"]
    title: str = Field(min_length=1, max_length=300)
    poster_path: str | None = None
    status: WatchStatus = "want"
    season: int | None = Field(default=None, ge=0)
    episode: int | None = Field(default=None, ge=0)
    notes: str | None = None


class WatchItemUpdate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    poster_path: str | None = None
    status: WatchStatus | None = None
    season: int | None = Field(default=None, ge=0)
    episode: int | None = Field(default=None, ge=0)
    notes: str | None = None
