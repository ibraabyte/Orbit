"""The Orbit assistant: the user says what they want, their AI proposes changes, the app shows them, and only the
user's confirm saves anything.

The AI gets this user's recent items (short refs like "task-3", never ids or notes) and five tools: find_items to look
something up, and propose_create / propose_update / propose_delete / propose_complete_task. A propose tool only checks
the change against the same input schema the item's own router uses and records it; nothing is written here. The app
then sends each confirmed change to that router itself (POST /tasks, PATCH /expenses/{id}, ...), so every rule the
routers have still applies.
"""

import json
import types
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Literal, Union, get_args, get_origin
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ValidationError
from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from app import models as m
from app.models.plan import GOALS, LEVELS
from app.schemas import documents as document_schemas
from app.schemas import domains as s
from app.schemas import fitness as fitness_schemas
from app.schemas import food as food_schemas
from app.schemas import medications as medication_schemas
from app.schemas import plan as plan_schemas
from app.schemas import training as training_schemas
from app.schemas.tasks import ReminderCreate, ReminderUpdate, TaskCreate, TaskListCreate, TaskListUpdate, TaskUpdate
from app.services import saver_ai, sections
from app.services import workout_plan as wp
from app.services.agent import Call, Tool

MAX_ACTIONS = 12
TEXT_MAX = 120
FIND_LIMIT = 10
# Fields the assistant never sets: bookkeeping the app or the server fills in.
HIDDEN = {"reminder_sent_at", "sent_at", "meal_plan_id", "color", "poster_path", "position", "place_id"}


@dataclass(frozen=True)
class Kind:
    name: str
    about: str
    model: Any
    create: type[BaseModel] | None
    update: type[BaseModel] | None
    # The text column shown as the item's name and searched by find_items.
    label: str
    # What the AI sees of each recent item, besides its ref and label.
    shows: tuple[str, ...]
    recent: int
    order: Any = None
    where: tuple[Any, ...] = ()
    # Fields that point at another item, and that item's kind.
    refs: dict[str, str] = field(default_factory=dict)
    # False for kinds the app has no delete for (a planned day is moved, not deleted).
    deletable: bool = True


def _kinds() -> dict[str, Kind]:
    k = [
        Kind("task", "a to-do. Put it in a list with list_id (a task_list ref) or list_name (a new list is made if none has "
             "that name); steps are its checklist lines", m.Task, TaskCreate, TaskUpdate, "title",
             ("due_at", "priority", "recurrence", "list_id"), 40, m.Task.due_at.asc().nulls_last(), (m.Task.status == "open",),
             {"list_id": "task_list"}),
        Kind("task_list", "a list that groups tasks, like Home or Work", m.TaskList, TaskListCreate, TaskListUpdate, "name", (),
             30, m.TaskList.position.asc()),
        Kind("reminder", "a reminder at a set time", m.Reminder, ReminderCreate, ReminderUpdate, "title", ("remind_at",), 20,
             m.Reminder.remind_at.asc(), (m.Reminder.status == "scheduled",), {"task_id": "task"}),
        Kind("expense", "money spent", m.Expense, s.ExpenseCreate, s.ExpenseUpdate, "merchant",
             ("amount", "currency", "category", "spent_at"), 20, m.Expense.spent_at.desc()),
        Kind("bill", "a bill or subscription (category subscriptions) that repeats", m.Bill, s.BillCreate, s.BillUpdate, "name",
             ("amount", "currency", "category", "due_at", "recurrence", "status", "card_id"), 30, m.Bill.due_at.asc(),
             (m.Bill.status != "paid",), {"card_id": "card"}),
        Kind("budget", "a monthly spending limit for one category (month is the first day of the month)", m.Budget, s.BudgetCreate,
             s.BudgetUpdate, "category", ("month", "amount", "currency"), 24, m.Budget.month.desc()),
        Kind("meal", "food eaten (the food log). To log a saved food, set food_id (a food ref) and servings; leave food_id out "
             "for an estimate", m.Meal, s.MealCreate, s.MealUpdate, "name", ("calories", "meal_type", "logged_at"),
             20, m.Meal.logged_at.desc(), (), {"food_id": "food"}),
        Kind("food", "a saved food, with its numbers for one serving (the user's own, like a home kabsa). Only create one "
             "when the user asks to save a food", m.Food, food_schemas.FoodCreate, food_schemas.FoodUpdate, "name",
             ("serving_label", "calories"), 30, m.Food.last_used_at.desc().nulls_last()),
        Kind("grocery", "something to buy (the shopping list)", m.GroceryItem, s.GroceryItemCreate, s.GroceryItemUpdate, "name",
             ("quantity", "category"), 30, m.GroceryItem.created_at.desc(), (m.GroceryItem.status == "needed",)),
        Kind("workout", "a workout done", m.Workout, s.WorkoutCreate, s.WorkoutUpdate, "type",
             ("duration_minutes", "calories", "logged_at"), 10, m.Workout.logged_at.desc()),
        Kind("sleep", "a night's sleep", m.SleepLog, s.SleepLogCreate, s.SleepLogUpdate, "note", ("sleep_date", "duration_minutes"), 7,
             m.SleepLog.sleep_date.desc()),
        Kind("weight", "a body weight entry", m.WeightLog, s.WeightLogCreate, s.WeightLogUpdate, "unit", ("weight", "logged_at"), 5,
             m.WeightLog.logged_at.desc()),
        Kind("habit", "a habit to keep", m.Habit, s.HabitCreate, s.HabitUpdate, "name", ("frequency", "target_count"), 20,
             m.Habit.created_at.asc(), (m.Habit.archived_at.is_(None),)),
        Kind("habit_log", "one time a habit was done (create one to mark a habit done)", m.HabitLog, s.HabitLogCreate, None, "note",
             ("habit_id", "logged_at"), 20, m.HabitLog.logged_at.desc(), (), {"habit_id": "habit"}),
        Kind("note", "something kept in the Saver: a link, video, post, picture or text shared from any app, with a summary "
             "and tags. status want = still to see, done = seen. find_items looks inside them (what the AI saw, what is said "
             "in the video), so use it to answer questions about what the user saved", m.Capture, s.CaptureCreate,
             s.CaptureUpdate, "title", ("type", "category", "status", "summary", "labels", "url"), 10, m.Capture.created_at.desc()),
        Kind("money_account", "a place money is kept (bank, wallet, cash) with its balance", m.MoneyAccount, s.MoneyAccountCreate,
             s.MoneyAccountUpdate, "name", ("kind", "balance", "currency"), 20, m.MoneyAccount.created_at.asc()),
        Kind("investment", "an investment with what was put in and what it is worth now", m.Investment, s.InvestmentCreate,
             s.InvestmentUpdate, "name", ("kind", "invested", "current_value", "currency"), 20, m.Investment.created_at.asc()),
        Kind("card", "a payment card (only its last 4 digits, never the full number)", m.Card, s.CardCreate, s.CardUpdate, "name",
             ("network", "kind", "last4"), 10, m.Card.created_at.asc()),
        Kind("medication", "a medicine or supplement taken on a schedule (times are HH:MM in the day; schedule daily, "
             "weekdays with weekdays 0 Monday to 6 Sunday, or every_hours). paused stops its reminders", m.Medication,
             medication_schemas.MedicationCreate, medication_schemas.MedicationUpdate, "name",
             ("dose", "schedule", "times", "weekdays", "every_hours", "paused", "stock"), 20, m.Medication.created_at.asc()),
        Kind("document", "an ID or paper that expires (passport, national ID, iqama, driving licence...), reminded "
             "remind_days days before expires_on", m.Document, document_schemas.DocumentCreate, document_schemas.DocumentUpdate,
             "name", ("kind", "holder", "expires_on"), 20, m.Document.expires_on.asc()),
        Kind("vehicle", "a car, with its expiry dates and next oil change", m.Vehicle, s.VehicleCreate, s.VehicleUpdate, "name",
             ("odometer_km", "registration_expires_at", "insurance_expires_at", "inspection_expires_at", "next_oil_change_at",
              "next_oil_change_km"), 10, m.Vehicle.created_at.asc()),
        Kind("injury", "an injury or sore area. While active, the workout plan and the exercise library leave out exercises "
             "that load it", m.Injury, fitness_schemas.InjuryCreate, fitness_schemas.InjuryUpdate, "area",
             ("active", "started_on", "ended_on"), 10, m.Injury.created_at.desc()),
        Kind("body_measurement", "a body measurement (waist, chest, arm, body fat...)", m.BodyMeasurement,
             training_schemas.BodyMeasurementCreate, training_schemas.BodyMeasurementUpdate, "kind",
             ("value", "unit", "measured_at"), 10, m.BodyMeasurement.measured_at.desc()),
        Kind("planned_day", "a coming day of the workout plan, with its exercises. It can't be made or deleted, only moved "
             "with propose_move_workout_day", m.PlannedWorkout, None, None, "kind", ("plan_date",), 0,
             m.PlannedWorkout.plan_date.asc(), deletable=False),
        Kind("planned_exercise", "one exercise of a coming planned day: create one to add an exercise to that day "
             "(planned_workout_id is the planned_day ref, exercise_id comes from find_items with kind exercise); update "
             "sets, reps_low, reps_high, rest_seconds, or exercise_id to swap it; delete to take it off the day",
             m.PlannedExercise, plan_schemas.PlannedExerciseCreate, plan_schemas.PlannedExerciseUpdate, "name",
             ("sets", "reps_low", "reps_high", "rest_seconds"), 0, m.PlannedExercise.position.asc(), (),
             {"planned_workout_id": "planned_day"}),
    ]  # fmt: skip
    return {kind.name: kind for kind in k}


KINDS = _kinds()
KIND_NAMES = list(KINDS)


# What the AI is told about each kind's fields, read from the router's own schemas so the two never drift.

_TYPE_NAMES = {str: "text", int: "whole number", float: "number", bool: "true/false", datetime: "date-time", date: "date"}


def _type_name(annotation: Any) -> str:
    origin = get_origin(annotation)
    if origin is Literal:
        return " | ".join(str(arg) for arg in get_args(annotation))
    if origin in (Union, types.UnionType):
        return " or ".join(_type_name(arg) for arg in get_args(annotation) if arg is not type(None))
    if origin is list:
        return "list of text"
    if annotation is uuid.UUID:
        return "ref"
    return _TYPE_NAMES.get(annotation, "text")


def _fields_doc(schema: type[BaseModel]) -> str:
    parts = []
    for name, info in schema.model_fields.items():
        if name in HIDDEN:
            continue
        parts.append(f"{name} ({_type_name(info.annotation)}{', required' if info.is_required() else ''})")
    return ", ".join(parts)


def kinds_doc() -> str:
    lines = []
    for kind in KINDS.values():
        line = f"- {kind.name}: {kind.about}."
        if kind.create is not None:
            line += f" Create fields: {_fields_doc(kind.create)}."
        if kind.update is None and kind.create is not None:
            line += " Can't be changed, only deleted."
        lines.append(line)
    return "\n".join(lines)


# The conversation's refs: "task-3" stands for one of this user's rows, so the AI never sees or invents an id.


@dataclass
class Item:
    kind: str
    id: uuid.UUID
    label: str


@dataclass
class Run:
    """One request: who it is for, and the refs and proposed changes so far."""

    db: Session
    user_id: uuid.UUID
    zone: ZoneInfo
    currency: str
    items: dict[str, Item] = field(default_factory=dict)
    by_id: dict[uuid.UUID, str] = field(default_factory=dict)
    actions: list[dict[str, Any]] = field(default_factory=list)
    # Sections switched off in Settings: their kinds are neither shown to the AI nor changed by it.
    hidden: frozenset[str] = frozenset()

    def ref(self, kind: str, row: Any) -> str:
        if row.id in self.by_id:
            return self.by_id[row.id]
        number = sum(1 for item in self.items.values() if item.kind == kind) + 1
        # Refs carried over from an earlier request (a voice call) can leave gaps: never reuse a name.
        while f"{kind}-{number}" in self.items:
            number += 1
        name = f"{kind}-{number}"
        self.items[name] = Item(kind, row.id, _label(self, KINDS[kind], row))
        self.by_id[row.id] = name
        return name


def _cut(value: str) -> str:
    return value if len(value) <= TEXT_MAX else value[: TEXT_MAX - 1] + "…"


# Kinds with no name of their own: shown and labelled by their numbers, and not searchable.
UNNAMED = ("habit_log", "sleep", "weight")


def _label(run: "Run", kind: Kind, row: Any) -> str:
    if kind.name == "planned_day":
        return f"{row.kind} · {row.plan_date.isoformat()}"
    if kind.name == "document" and not row.name:
        return row.kind
    if kind.name == "habit_log":
        habit = run.items.get(run.by_id.get(row.habit_id, ""))
        return f"{habit.label if habit else 'habit'} · {_plain(row.logged_at, run.zone)}"
    if kind.name in UNNAMED:
        return f"{kind.name} · {_plain(getattr(row, kind.shows[0]), run.zone)}"
    value = getattr(row, kind.label, None)
    return _cut(str(value)) if value else kind.name


def _plain(value: Any, zone: ZoneInfo) -> Any:
    if isinstance(value, datetime):
        return value.astimezone(zone).replace(tzinfo=None).isoformat(timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        return _cut(value)
    return value


def _show(run: Run, kind: Kind, row: Any) -> dict[str, Any]:
    shown: dict[str, Any] = {"ref": run.ref(kind.name, row)}
    if kind.name not in UNNAMED:
        shown[kind.label] = _plain(getattr(row, kind.label), run.zone)
    for column in kind.shows:
        value = getattr(row, column)
        if value is None:
            continue
        if column in kind.refs:
            target = run.by_id.get(value)
            if target is None:
                continue
            value = target
        shown[column] = _plain(value, run.zone)
    return shown


SAVED_TEXT_MAX = 500


def _terms(text: str) -> list[str]:
    return [term.strip() for term in text.split(",") if term.strip()][:12]


def _show_saved(run: Run, row: m.Capture) -> dict[str, Any]:
    """A saved item found by find_items: its card, plus what is in it so the AI can answer from it. Never the user's note."""
    shown = _show(run, KINDS["note"], row)
    for name, value in (("what_is_in_it", row.analysis), ("post_text", row.content_text), ("said_in_video", row.transcript)):
        if value:
            shown[name] = value if len(value) <= SAVED_TEXT_MAX else value[: SAVED_TEXT_MAX - 1] + "…"
    return shown


def _owned(kind: Kind, user_id: uuid.UUID, *conditions: ColumnElement[bool]):
    return select(kind.model).where(kind.model.user_id == user_id, *kind.where, *conditions)


# The workout plan's kinds: shown together, as the plan and its coming days with their exercises.
PLAN_KINDS = ("planned_day", "planned_exercise")
GOALS_DOC = "goal is strength, muscle, fitness or fat_loss; level is beginner, intermediate or advanced"


def local_today(run: Run) -> date:
    return local_now(run.zone).date()


def _plan_items(run: Run) -> dict[str, Any]:
    plan = run.db.get(m.TrainingPlan, run.user_id)
    if plan is None:
        return {"workout_plan": None}
    days = run.db.scalars(
        select(m.PlannedWorkout)
        .where(
            m.PlannedWorkout.user_id == run.user_id,
            m.PlannedWorkout.plan_date >= local_today(run),
            m.PlannedWorkout.workout_id.is_(None),
        )
        .order_by(m.PlannedWorkout.plan_date)
        .limit(wp.HORIZON_DAYS)
    ).all()
    entries: dict[uuid.UUID, list[m.PlannedExercise]] = {day.id: [] for day in days}
    if days:
        query = select(m.PlannedExercise).where(m.PlannedExercise.planned_workout_id.in_(entries)).order_by(m.PlannedExercise.position)
        for entry in run.db.scalars(query):
            entries[entry.planned_workout_id].append(entry)
    shown_days = [
        {
            "ref": run.ref("planned_day", day),
            "date": day.plan_date.isoformat(),
            "weekday": day.plan_date.strftime("%A"),
            "day": day.kind,
            "exercises": [_show(run, KINDS["planned_exercise"], entry) for entry in entries[day.id]],
        }
        for day in days
    ]
    weekdays = [date(2024, 1, 1 + number).strftime("%A") for number in plan.weekdays]  # 2024-01-01 is a Monday.
    shown_plan = {"goal": plan.goal, "level": plan.level, "weekdays": list(plan.weekdays), "days": weekdays}
    return {"workout_plan": shown_plan, "planned_day": shown_days}


def recent_items(run: Run) -> dict[str, Any]:
    """Each kind's recent or open items. Kinds others point at (cards, habits, lists, tasks) come first, so their refs exist."""
    items: dict[str, Any] = {}
    first = ("card", "habit", "task_list", "task", "food")
    for name in (*first, *[n for n in KINDS if n not in first]):
        if not sections.kind_on(name, run.hidden):
            continue
        if name in PLAN_KINDS:
            continue
        kind = KINDS[name]
        rows = run.db.scalars(_owned(kind, run.user_id).order_by(kind.order, kind.model.id).limit(kind.recent)).all()
        if rows:
            items[name] = [_show(run, kind, row) for row in rows]
    if sections.kind_on("planned_day", run.hidden):
        items.update(_plan_items(run))
    return items


def default_currency(db: Session, user_id: uuid.UUID) -> str:
    for model, when in ((m.Expense, m.Expense.spent_at), (m.Bill, m.Bill.created_at)):
        found = db.scalar(select(model.currency).where(model.user_id == user_id).order_by(when.desc()).limit(1))
        if found:
            return found
    return "SAR"


# The tools


def tools(hidden: frozenset[str] = frozenset()) -> list[Tool]:
    names = [name for name in KIND_NAMES if sections.kind_on(name, hidden)]
    kind = {"type": "string", "enum": names}
    plan_on = sections.kind_on("planned_day", hidden)
    searchable = {"type": "string", "enum": [*names, "exercise"] if plan_on else names}
    ref = {"type": "string", "description": "A ref from the items list or from find_items, like task-3."}
    fields = {"type": "object", "description": "The item's fields, named as in the kinds list."}
    found = [
        Tool(
            "find_items",
            "Search this user's items of one kind by name or title, for one that isn't in the items list. Returns refs. "
            "For note (the Saver) it also searches inside each item; give several words or synonyms, Arabic and English, "
            "separated by commas, like: مطعم, restaurant, مطاعم الرياض. kind exercise searches the exercise library by "
            "its English name (like: bench press, squat, lat pulldown) and returns exercise_id values to put in a "
            "planned_exercise; prefer ones with fits_my_gym true.",
            {"type": "object", "properties": {"kind": searchable, "text": {"type": "string"}}, "required": ["kind", "text"]},
        ),
        Tool(
            "propose_create",
            "Propose a new item. Nothing is saved until the user confirms.",
            {"type": "object", "properties": {"kind": kind, "fields": fields}, "required": ["kind", "fields"]},
        ),
        Tool(
            "propose_update",
            "Propose changing some fields of an existing item. Send only the fields that change.",
            {"type": "object", "properties": {"kind": kind, "ref": ref, "fields": fields}, "required": ["kind", "ref", "fields"]},
        ),
        Tool(
            "propose_delete",
            "Propose deleting an existing item.",
            {"type": "object", "properties": {"kind": kind, "ref": ref}, "required": ["kind", "ref"]},
        ),
        Tool(
            "propose_complete_task",
            "Propose marking a task done. Use this, not propose_update, so a repeating task makes its next one.",
            {"type": "object", "properties": {"ref": ref}, "required": ["ref"]},
        ),
    ]
    if not plan_on:
        return found
    return [
        *found,
        Tool(
            "propose_set_workout_plan",
            "Propose making the workout plan (the weekly workout schedule), or changing it. Orbit then lays out the coming "
            f"days and picks exercises that fit the user's gym and injuries. {GOALS_DOC}; weekdays are the training days, "
            "0 Monday to 6 Sunday (Saturday 5, Sunday 6). When changing it, send only what changes. Changing it lays the "
            "coming days out again, so edits to their exercises are lost.",
            {
                "type": "object",
                "properties": {
                    "goal": {"type": "string", "enum": list(GOALS), "description": "What they train for."},
                    "level": {"type": "string", "enum": list(LEVELS), "description": "How experienced they are."},
                    "weekdays": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 6}},
                },
            },
        ),
        Tool(
            "propose_stop_workout_plan",
            "Propose turning the workout plan off. Logged workouts stay.",
            {"type": "object", "properties": {"reason": {"type": "string", "description": "Why, in a few words, if they said."}}},
        ),
        Tool(
            "propose_move_workout_day",
            'Propose moving a coming planned day to the next day ("not going today"); the days after it shift as needed.',
            {"type": "object", "properties": {"ref": ref}, "required": ["ref"]},
        ),
    ]


def _result(**values: Any) -> str:
    return json.dumps(values, ensure_ascii=False)


def _errors(exc: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(p) for p in error['loc']) or 'fields'}: {error['msg']}" for error in exc.errors()[:6])


def _target(run: Run, kind: str, ref: Any) -> Item | str:
    item = run.items.get(ref) if isinstance(ref, str) else None
    if item is None:
        return f"Unknown ref {ref!r}. Use a ref from the items list, or find_items first."
    if item.kind != kind:
        return f"{ref} is a {item.kind}, not a {kind}."
    return item


def _prepare(run: Run, kind: Kind, fields: dict[str, Any], creating: bool) -> dict[str, Any] | str:
    """Refs turned into ids and the obvious defaults filled in; an error text for the AI otherwise."""
    values = dict(fields)
    for name in values:
        if name in HIDDEN:
            return f"{name} can't be set by the assistant."
    for name, target in kind.refs.items():
        if values.get(name) is not None:
            item = _target(run, target, values[name])
            if isinstance(item, str):
                return f"{name}: {item}"
            values[name] = str(item.id)
    if creating and kind.name == "meal" and values.get("food_id") is not None:
        filled = _from_saved_food(run, values)
        if isinstance(filled, str):
            return filled
        values = filled
    if creating:
        now = datetime.now(run.zone).isoformat(timespec="minutes")
        schema_fields = kind.create.model_fields
        for name in ("spent_at", "logged_at", "measured_at"):
            if name in schema_fields and values.get(name) is None and schema_fields[name].is_required():
                values[name] = now
        if "currency" in schema_fields and not values.get("currency"):
            values["currency"] = run.currency
    return values


def _from_saved_food(run: Run, values: dict[str, Any]) -> dict[str, Any] | str:
    """A meal of a saved food takes the food's own numbers times the servings, never the AI's guess."""
    food = run.db.scalar(select(m.Food).where(m.Food.id == uuid.UUID(values["food_id"]), m.Food.user_id == run.user_id))
    if food is None:
        return "food_id: that food is not one of the user's saved foods."
    try:
        given = values.get("servings")
        servings = Decimal(1 if given is None else str(given))
        if not 0 < servings <= 50:
            return "servings: must be more than 0 and at most 50."
    except ArithmeticError:
        return "servings: must be a number."

    def times(value: Decimal | None) -> float | None:
        return None if value is None else float((value * servings).quantize(Decimal("0.1")))

    name = f"{food.name} ({food.brand})" if food.brand else food.name
    return {
        **values,
        "name": name[:220],
        "servings": float(servings),
        "calories": int((food.calories * servings).to_integral_value()),
        "protein_g": times(food.protein_g),
        "carbs_g": times(food.carbs_g),
        "fat_g": times(food.fat_g),
    }


def _with_zone(run: Run, schema: type[BaseModel], values: dict[str, Any]) -> dict[str, Any]:
    """A time the AI sent without a time zone is the user's local time, not UTC."""
    parsed = schema.model_validate(values)
    for name in values:
        value = getattr(parsed, name, None)
        if isinstance(value, datetime) and value.tzinfo is None:
            values[name] = value.replace(tzinfo=run.zone).isoformat()
    return values


def _checked(run: Run, schema: type[BaseModel], values: dict[str, Any]) -> dict[str, Any] | str:
    try:
        values = _with_zone(run, schema, values)
        return schema.model_validate(values).model_dump(mode="json", exclude_unset=True)
    except ValidationError as exc:
        return f"Not valid: {_errors(exc)}"


def _record(run: Run, action: dict[str, Any]) -> str:
    if len(run.actions) >= MAX_ACTIONS:
        return _result(error=f"At most {MAX_ACTIONS} changes at a time. Tell the user to do the rest next.")
    run.actions.append(action)
    return _result(ok=True, note="Shown to the user to confirm. Not saved yet.")


def handle(run: Run, call: Call) -> str:
    args = call.arguments
    if args is None:
        return _result(error="The arguments must be a JSON object.")
    if call.name in PLAN_TOOLS:
        if not sections.kind_on("planned_day", run.hidden):
            return _result(error="The user switched off the part of Orbit that holds the workout plan. Say so; don't change it.")
        return PLAN_TOOLS[call.name](run, args)
    if call.name == "find_items" and args.get("kind") == "exercise":
        if not sections.kind_on("planned_day", run.hidden):
            return _result(error="The user switched off the exercises part of Orbit.")
        return _find_exercises(run, str(args.get("text") or ""))
    if call.name == "propose_complete_task":
        item = _target(run, "task", args.get("ref"))
        if isinstance(item, str):
            return _result(error=item)
        return _record(run, {"op": "complete", "kind": "task", "id": str(item.id), "label": item.label, "fields": {}})
    kind = KINDS.get(args.get("kind")) if isinstance(args.get("kind"), str) else None
    if kind is None:
        return _result(error=f"kind must be one of: {', '.join(KIND_NAMES)}.")
    if not sections.kind_on(kind.name, run.hidden):
        return _result(error=f"The user switched off the part of Orbit that holds {kind.name} items. Say so; don't change them.")

    if call.name == "find_items":
        text = str(args.get("text") or "").strip()[:100]
        if kind.name in UNNAMED or kind.name in PLAN_KINDS:
            return _result(error=f"A {kind.name} has no name to search; use the items list.")
        if not text:
            return _result(error="Say what to look for.")
        if kind.name == "note":
            return _result(items=[_show_saved(run, row) for row in saver_ai.find(run.db, run.user_id, _terms(text), FIND_LIMIT)])
        column = getattr(kind.model, kind.label)
        rows = run.db.scalars(
            _owned(kind, run.user_id, column.ilike(f"%{text}%")).order_by(kind.order, kind.model.id).limit(FIND_LIMIT)
        ).all()
        return _result(items=[_show(run, kind, row) for row in rows])

    if call.name == "propose_delete":
        if not kind.deletable:
            return _result(error=f"A {kind.name} can't be deleted.")
        item = _target(run, kind.name, args.get("ref"))
        if isinstance(item, str):
            return _result(error=item)
        return _record(run, {"op": "delete", "kind": kind.name, "id": str(item.id), "label": item.label, "fields": {}})

    fields = args.get("fields")
    if not isinstance(fields, dict) or not fields:
        return _result(error="fields must be an object with at least one field.")

    if call.name == "propose_create":
        if kind.create is None:
            return _result(error=f"A {kind.name} can't be made here.")
        values = _prepare(run, kind, fields, creating=True)
        checked = _checked(run, kind.create, values) if isinstance(values, dict) else values
        if isinstance(checked, str):
            return _result(error=checked)
        label = checked.get(kind.label) if kind.name not in UNNAMED else None
        if kind.name == "habit_log":
            habit = run.items.get(run.by_id.get(uuid.UUID(checked["habit_id"]), ""))
            label = habit.label if habit else None
        elif kind.name in UNNAMED:
            label = f"{kind.name} · {checked.get(kind.shows[0])}"
        elif kind.name == "planned_exercise":
            exercise = run.db.get(m.Exercise, checked["exercise_id"])
            day = run.items.get(run.by_id.get(uuid.UUID(checked["planned_workout_id"]), ""))
            if exercise is None:
                return _result(error="exercise_id: not in the exercise library. Use find_items with kind exercise.")
            label = f"{exercise.name} → {day.label}" if day else exercise.name
        return _record(run, {"op": "create", "kind": kind.name, "id": None, "label": _cut(str(label or kind.name)), "fields": checked})

    if call.name == "propose_update":
        if kind.update is None:
            return _result(error=f"A {kind.name} can't be changed. Delete it and create a new one instead.")
        item = _target(run, kind.name, args.get("ref"))
        if isinstance(item, str):
            return _result(error=item)
        values = _prepare(run, kind, fields, creating=False)
        checked = _checked(run, kind.update, values) if isinstance(values, dict) else values
        if isinstance(checked, str):
            return _result(error=checked)
        if kind.name == "planned_exercise" and checked.get("exercise_id") and run.db.get(m.Exercise, checked["exercise_id"]) is None:
            return _result(error="exercise_id: not in the exercise library. Use find_items with kind exercise.")
        if kind.name == "task" and checked == {"status": "done"}:
            return _record(run, {"op": "complete", "kind": "task", "id": str(item.id), "label": item.label, "fields": {}})
        return _record(run, {"op": "update", "kind": kind.name, "id": str(item.id), "label": item.label, "fields": checked})

    return _result(error=f"No tool named {call.name}.")


# The workout plan's own tools. The plan is one per user, so it needs no ref.

EXERCISE_FIND_LIMIT = 8


def _find_exercises(run: Run, text: str) -> str:
    words = [word for word in text.replace(",", " ").split() if word][:6]
    if not words:
        return _result(error="Say which exercise to look for, by its English name.")
    query = select(m.Exercise).where(*[m.Exercise.name.ilike(f"%{word[:40]}%") for word in words]).order_by(m.Exercise.name)
    rows = run.db.scalars(query.limit(40)).all()
    plan = run.db.get(m.TrainingPlan, run.user_id)
    fit = wp.load_fit(run.db, run.user_id, plan.level if plan else "intermediate")
    rows = sorted(rows, key=lambda row: (not fit.allows(row), row.id not in fit.done_before, len(row.name)))[:EXERCISE_FIND_LIMIT]
    return _result(
        items=[
            {
                "exercise_id": row.id,
                "name": row.name,
                "equipment": row.equipment,
                "muscle": row.primary_muscles[0] if row.primary_muscles else None,
                "fits_my_gym": fit.allows(row),
                "done_before": row.id in fit.done_before,
            }
            for row in rows
        ]
    )


PLAN_LABEL = "Workout plan"


def _set_plan(run: Run, args: dict[str, Any]) -> str:
    plan = run.db.get(m.TrainingPlan, run.user_id)
    given = {name: args[name] for name in ("goal", "level", "weekdays") if args.get(name) is not None}
    if plan is None and "goal" not in given:
        return _result(error="A new plan needs a goal. Ask the user what they train for if they didn't say.")
    if not given:
        return _result(error="Send what changes: goal, level or weekdays.")
    current = {"goal": plan.goal, "level": plan.level, "weekdays": list(plan.weekdays)} if plan else {}
    checked = _checked(run, plan_schemas.PlanIn, {**current, **given})
    if isinstance(checked, str):
        return _result(error=checked)
    checked = {"level": "intermediate", **checked}
    if plan is not None and checked == current:
        return _result(error="The plan is already like that.")
    op = "update" if plan else "create"
    return _record(run, {"op": op, "kind": "workout_plan", "id": None, "label": PLAN_LABEL, "fields": checked})


def _stop_plan(run: Run, args: dict[str, Any]) -> str:
    if run.db.get(m.TrainingPlan, run.user_id) is None:
        return _result(error="There is no workout plan to stop.")
    return _record(run, {"op": "delete", "kind": "workout_plan", "id": None, "label": PLAN_LABEL, "fields": {}})


def _move_day(run: Run, args: dict[str, Any]) -> str:
    item = _target(run, "planned_day", args.get("ref"))
    if isinstance(item, str):
        return _result(error=item)
    return _record(run, {"op": "move", "kind": "planned_day", "id": str(item.id), "label": item.label, "fields": {}})


PLAN_TOOLS = {"propose_set_workout_plan": _set_plan, "propose_stop_workout_plan": _stop_plan, "propose_move_workout_day": _move_day}


def local_now(zone: ZoneInfo) -> datetime:
    return datetime.now(UTC).astimezone(zone)


def lay_out_plan(run: Run) -> None:
    """The plan's coming days, laid out the way the plan screen does it, so the AI can point at them. This happens before
    the AI runs and is the plan's own rule, never the AI's choice."""
    if not sections.kind_on("planned_day", run.hidden):
        return
    plan = run.db.get(m.TrainingPlan, run.user_id)
    if plan is not None:
        wp.lay_out(run.db, run.user_id, plan, local_today(run))
        run.db.commit()


def context(run: Run) -> dict[str, Any]:
    lay_out_plan(run)
    now = local_now(run.zone)
    start = datetime.combine(now.date(), time.min, run.zone)
    return {
        "now": now.replace(tzinfo=None).isoformat(timespec="minutes"),
        "weekday": now.strftime("%A"),
        "time_zone": run.zone.key,
        "tomorrow": (start + timedelta(days=1)).date().isoformat(),
        "default_currency": run.currency,
        "items": recent_items(run),
    }
