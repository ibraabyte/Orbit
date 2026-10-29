"""Create, read, update and delete for every owner-scoped table that has no special rules of its own.

Each is the shared owner-filtered router from app/crud.py. The few extra routes below are the writes the
app used to do with a Supabase upsert: tags by name, one journal entry per day, one watch-list row per title.
"""

from datetime import date

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import models as m
from app.crud import owned_crud_router
from app.deps import Db, UserId
from app.schemas import domains as s
from app.schemas.rows import row_schema
from app.services.tags import check_target, ensure_tags


def _check_tagging(db: Session, tagging: m.Tagging) -> None:
    check_target(db, tagging.user_id, tagging.target_type, tagging.target_id)


tags = owned_crud_router(m.Tag, prefix="/tags", create=s.TagCreate, update=s.TagUpdate, order_by=m.Tag.name.asc())
TagRow = row_schema(m.Tag)


@tags.post("/ensure", response_model=list[TagRow])
def ensure(body: s.TagNamesIn, user_id: UserId, db: Db):
    """The user's tags with these names, creating any that don't exist yet."""
    found = ensure_tags(db, user_id, body.names)
    db.commit()
    return found


taggings = owned_crud_router(
    m.Tagging, prefix="/taggings", create=s.TaggingCreate, update=None, order_by=m.Tagging.created_at.desc(), after_create=_check_tagging
)

captures = owned_crud_router(
    m.Capture,
    prefix="/captures",
    create=s.CaptureCreate,
    update=s.CaptureUpdate,
    order_by=m.Capture.created_at.desc(),
    tag_target="capture",
)
meals = owned_crud_router(
    m.Meal, prefix="/meals", create=s.MealCreate, update=s.MealUpdate, order_by=m.Meal.logged_at.desc(), tag_target="meal"
)
meal_plans = owned_crud_router(
    m.MealPlan,
    prefix="/meal-plans",
    create=s.MealPlanCreate,
    update=s.MealPlanUpdate,
    order_by=m.MealPlan.plan_date.desc(),
    tag_target="meal_plan",
)
grocery_items = owned_crud_router(
    m.GroceryItem,
    prefix="/grocery-items",
    create=s.GroceryItemCreate,
    update=s.GroceryItemUpdate,
    order_by=m.GroceryItem.created_at.desc(),
    tag_target="grocery_item",
)
weight_logs = owned_crud_router(
    m.WeightLog, prefix="/weight-logs", create=s.WeightLogCreate, update=s.WeightLogUpdate, order_by=m.WeightLog.logged_at.desc()
)
workouts = owned_crud_router(
    m.Workout, prefix="/workouts", create=s.WorkoutCreate, update=s.WorkoutUpdate, order_by=m.Workout.logged_at.desc(), tag_target="workout"
)
sleep_logs = owned_crud_router(
    m.SleepLog,
    prefix="/sleep-logs",
    create=s.SleepLogCreate,
    update=s.SleepLogUpdate,
    order_by=m.SleepLog.sleep_date.desc(),
    tag_target="sleep",
)
focus_sessions = owned_crud_router(
    m.FocusSession,
    prefix="/focus-sessions",
    create=s.FocusSessionCreate,
    update=s.FocusSessionUpdate,
    order_by=m.FocusSession.started_at.desc(),
    tag_target="focus_session",
)
habits = owned_crud_router(m.Habit, prefix="/habits", create=s.HabitCreate, update=s.HabitUpdate, order_by=m.Habit.created_at.desc())
habit_logs = owned_crud_router(
    m.HabitLog, prefix="/habit-logs", create=s.HabitLogCreate, update=s.HabitLogUpdate, order_by=m.HabitLog.logged_at.desc()
)
goals = owned_crud_router(m.Goal, prefix="/goals", create=s.GoalCreate, update=s.GoalUpdate, order_by=m.Goal.updated_at.desc())
goal_milestones = owned_crud_router(
    m.GoalMilestone,
    prefix="/goal-milestones",
    create=s.GoalMilestoneCreate,
    update=s.GoalMilestoneUpdate,
    order_by=m.GoalMilestone.created_at.desc(),
)
journal_entries = owned_crud_router(
    m.JournalEntry,
    prefix="/journal-entries",
    create=s.JournalEntryCreate,
    update=s.JournalEntryUpdate,
    order_by=m.JournalEntry.entry_date.desc(),
)
JournalRow = row_schema(m.JournalEntry)


@journal_entries.put("/day/{entry_date}", response_model=JournalRow)
def write_day(entry_date: date, body: s.JournalDayIn, user_id: UserId, db: Db):
    """One entry per day: writes that day's entry, replacing what was there."""
    changes = {**body.model_dump(), "updated_at": func.now()}
    db.execute(
        insert(m.JournalEntry)
        .values(**body.model_dump(), user_id=user_id, entry_date=entry_date)
        .on_conflict_do_update(constraint="journal_entries_user_id_entry_date_key", set_=changes)
    )
    db.commit()
    return db.scalar(select(m.JournalEntry).where(m.JournalEntry.user_id == user_id, m.JournalEntry.entry_date == entry_date))


people = owned_crud_router(m.Person, prefix="/people", create=s.PersonCreate, update=s.PersonUpdate, order_by=m.Person.updated_at.desc())
expenses = owned_crud_router(
    m.Expense, prefix="/expenses", create=s.ExpenseCreate, update=s.ExpenseUpdate, order_by=m.Expense.spent_at.desc(), tag_target="expense"
)
bills = owned_crud_router(
    m.Bill, prefix="/bills", create=s.BillCreate, update=s.BillUpdate, order_by=m.Bill.due_at.asc(), tag_target="bill"
)
vehicles = owned_crud_router(
    m.Vehicle, prefix="/vehicles", create=s.VehicleCreate, update=s.VehicleUpdate, order_by=m.Vehicle.created_at.asc()
)
watch_items = owned_crud_router(
    m.WatchItem, prefix="/watch-items", create=s.WatchItemCreate, update=s.WatchItemUpdate, order_by=m.WatchItem.updated_at.desc()
)
WatchRow = row_schema(m.WatchItem)


@watch_items.put("", response_model=WatchRow)
def save_title(body: s.WatchItemCreate, user_id: UserId, db: Db):
    """Adds a movie or series, or updates it if it's already on the list (one row per title).
    An update changes only the fields sent, so notes survive re-adding a title."""
    values = body.model_dump()
    sent = body.model_dump(exclude_unset=True, exclude={"tmdb_id", "media_type"})
    changes = sent | {"updated_at": func.now()}
    db.execute(
        insert(m.WatchItem)
        .values(**values, user_id=user_id)
        .on_conflict_do_update(constraint="watch_items_user_id_media_type_tmdb_id_key", set_=changes)
    )
    db.commit()
    return db.scalar(
        select(m.WatchItem).where(
            m.WatchItem.user_id == user_id, m.WatchItem.media_type == body.media_type, m.WatchItem.tmdb_id == body.tmdb_id
        )
    )


ROUTERS: list[APIRouter] = [
    tags,
    taggings,
    captures,
    meals,
    meal_plans,
    grocery_items,
    weight_logs,
    workouts,
    sleep_logs,
    focus_sessions,
    habits,
    habit_logs,
    goals,
    goal_milestones,
    journal_entries,
    people,
    expenses,
    bills,
    vehicles,
    watch_items,
]
