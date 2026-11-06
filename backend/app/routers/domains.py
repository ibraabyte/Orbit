"""Create, read, update and delete for every owner-scoped table that has no special rules of its own.

Each is the shared owner-filtered router from app/crud.py. The few extra routes below are the writes the
app used to do with a Supabase upsert: tags by name and one watch-list row per title.
"""

from fastapi import APIRouter, status
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
habits = owned_crud_router(m.Habit, prefix="/habits", create=s.HabitCreate, update=s.HabitUpdate, order_by=m.Habit.created_at.desc())
habit_logs = owned_crud_router(
    m.HabitLog, prefix="/habit-logs", create=s.HabitLogCreate, update=s.HabitLogUpdate, order_by=m.HabitLog.logged_at.desc()
)
expenses = owned_crud_router(
    m.Expense, prefix="/expenses", create=s.ExpenseCreate, update=s.ExpenseUpdate, order_by=m.Expense.spent_at.desc(), tag_target="expense"
)
bills = owned_crud_router(
    m.Bill, prefix="/bills", create=s.BillCreate, update=s.BillUpdate, order_by=m.Bill.due_at.asc(), tag_target="bill"
)
budgets = owned_crud_router(m.Budget, prefix="/budgets", create=s.BudgetCreate, update=s.BudgetUpdate, order_by=m.Budget.month.desc())
# A bill's card_id must be one of the user's own cards: the (card_id, user_id) foreign key refuses any other.
cards = owned_crud_router(m.Card, prefix="/cards", create=s.CardCreate, update=s.CardUpdate, order_by=m.Card.created_at.asc())
money_accounts = owned_crud_router(
    m.MoneyAccount,
    prefix="/money-accounts",
    create=s.MoneyAccountCreate,
    update=s.MoneyAccountUpdate,
    order_by=m.MoneyAccount.created_at.asc(),
)


def _revalued(row: m.Investment, sent: set[str]) -> None:
    if "current_value" in sent:
        row.valued_at = func.now()


investments = owned_crud_router(
    m.Investment,
    prefix="/investments",
    create=s.InvestmentCreate,
    update=s.InvestmentUpdate,
    order_by=m.Investment.created_at.asc(),
    after_update=_revalued,
)
obligations = owned_crud_router(
    m.Obligation, prefix="/obligations", create=s.ObligationCreate, update=s.ObligationUpdate, order_by=m.Obligation.created_at.asc()
)
ObligationRow = row_schema(m.Obligation)


@obligations.post("/plan", response_model=ObligationRow, status_code=status.HTTP_201_CREATED)
def create_plan(body: s.ObligationPlanCreate, user_id: UserId, db: Db):
    """An obligation and its whole installment schedule, saved together or not at all."""
    values = body.model_dump(exclude={"installments"})
    obligation = m.Obligation(**values, user_id=user_id)
    db.add(obligation)
    db.flush()
    for installment in body.installments:
        db.add(m.ObligationInstallment(**installment.model_dump(), obligation_id=obligation.id, user_id=user_id))
    db.commit()
    db.refresh(obligation)
    return obligation


# The (obligation_id, user_id) foreign key keeps installments on the user's own obligations.
obligation_installments = owned_crud_router(
    m.ObligationInstallment,
    prefix="/obligation-installments",
    create=s.ObligationInstallmentCreate,
    update=s.ObligationInstallmentUpdate,
    order_by=m.ObligationInstallment.due_on.asc(),
    max_limit=1000,
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
    habits,
    habit_logs,
    expenses,
    bills,
    budgets,
    cards,
    money_accounts,
    investments,
    obligations,
    obligation_installments,
    vehicles,
    watch_items,
]
