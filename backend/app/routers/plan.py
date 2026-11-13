"""The automatic workout plan: set it up, read the week, start a day, move a day, and swap an exercise.

The rules for laying out days, fitting them to recovery and finding swaps are in app/services/workout_plan.py.
Swapping also works inside a session that is already going (/training/workout-exercises/{id}/swap), for when the
machine is busy once you're at the gym.
"""

import uuid
from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.crud import get_owned
from app.deps import Db, UserId
from app.models import Exercise, GymEquipment, PlannedExercise, PlannedWorkout, Profile, TrainingPlan, Workout, WorkoutExercise, WorkoutSet
from app.routers.training import _add_exercise, _detail, _past
from app.schemas import plan as s
from app.schemas.training import ExerciseAdd, SessionDetail
from app.services import workout_plan as wp

router = APIRouter(prefix="/plan", tags=["plan"])
session_router = APIRouter(prefix="/training/workout-exercises", tags=["training"])

# The session's name when the app doesn't send one.
DAY_NAMES = {
    "full_a": "Full body A",
    "full_b": "Full body B",
    "push": "Push",
    "pull": "Pull",
    "legs": "Legs",
    "upper": "Upper body",
    "lower": "Lower body",
}


def user_today(db: Session, user_id: uuid.UUID) -> date:
    profile = db.get(Profile, user_id)
    try:
        zone = ZoneInfo(profile.timezone) if profile and profile.timezone else UTC
    except (KeyError, ValueError):
        zone = UTC
    return datetime.now(zone).date()


def _plan_out(plan: TrainingPlan) -> dict[str, Any]:
    return {"goal": plan.goal, "level": plan.level, "weekdays": list(plan.weekdays)}


def _exercises(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[PlannedExercise]]:
    grouped: dict[uuid.UUID, list[PlannedExercise]] = defaultdict(list)
    if ids:
        query = select(PlannedExercise).where(PlannedExercise.planned_workout_id.in_(ids)).order_by(PlannedExercise.position)
        for row in db.scalars(query):
            grouped[row.planned_workout_id].append(row)
    return grouped


def _days(db: Session, rows: list[PlannedWorkout], today: date, score: float | None) -> list[dict[str, Any]]:
    exercises = _exercises(db, [row.id for row in rows])
    catalogue_ids = {entry.exercise_id for group in exercises.values() for entry in group if entry.exercise_id}
    catalogue = {row.id: row for row in db.scalars(select(Exercise).where(Exercise.id.in_(catalogue_ids)))} if catalogue_ids else {}
    workout_ids = [row.workout_id for row in rows if row.workout_id]
    live = dict(db.execute(select(Workout.id, Workout.in_progress).where(Workout.id.in_(workout_ids))).all()) if workout_ids else {}
    out = []
    for row in rows:
        entries = exercises[row.id]
        if row.workout_id in live:
            state = "started" if live[row.workout_id] else "done"
            adjustment = row.adjustment or "none"
            recovery = row.recovery_score
        else:
            state = "missed" if row.plan_date < today else "planned"
            adjustment = wp.adjustment_for(score) if row.plan_date == today else "none"
            recovery = score if row.plan_date == today else None
        today_sets = dict((entry.id, sets) for entry, sets in wp.adjusted_sets(entries, adjustment))
        out.append(
            {
                "id": row.id,
                "date": row.plan_date,
                "kind": row.kind,
                "status": state,
                "workout_id": row.workout_id if row.workout_id in live else None,
                "adjustment": adjustment,
                "recovery_score": recovery,
                "exercises": [
                    {
                        "id": entry.id,
                        "exercise_id": entry.exercise_id,
                        "name": entry.name,
                        "slot": entry.slot,
                        "muscle": entry.muscle,
                        "position": entry.position,
                        "sets": today_sets.get(entry.id, entry.sets),
                        "base_sets": entry.sets,
                        "reps_low": entry.reps_low,
                        "reps_high": entry.reps_high,
                        "rest_seconds": entry.rest_seconds,
                        "swapped_from": entry.swapped_from,
                        **wp.describe(catalogue.get(entry.exercise_id or "")),
                    }
                    for entry in entries
                ],
                "dropped": [entry.id for entry in entries if entry.id not in today_sets],
            }
        )
    return out


def _plan(db: Session, user_id: uuid.UUID) -> TrainingPlan:
    plan = db.get(TrainingPlan, user_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No workout plan yet.")
    return plan


@router.get("", response_model=s.PlanOut | None)
def get_plan(user_id: UserId, db: Db):
    plan = db.get(TrainingPlan, user_id)
    return _plan_out(plan) if plan else None


@router.put("", response_model=s.PlanOut)
def set_plan(body: s.PlanIn, user_id: UserId, db: Db):
    """Saves the choices and lays the coming days out again. Days already started, and past days, stay as they were."""
    plan = db.get(TrainingPlan, user_id)
    if plan is None:
        plan = TrainingPlan(user_id=user_id, goal=body.goal, level=body.level, weekdays=body.weekdays)
        db.add(plan)
    else:
        plan.goal, plan.level, plan.weekdays = body.goal, body.level, body.weekdays
    db.flush()
    today = user_today(db, user_id)
    wp.clear_upcoming(db, user_id, today)
    wp.lay_out(db, user_id, plan, today, restart=True)
    db.commit()
    return _plan_out(plan)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def stop_plan(user_id: UserId, db: Db):
    """Turns the plan off: its coming days go; past days and every logged session stay."""
    wp.clear_upcoming(db, user_id, user_today(db, user_id))
    db.execute(delete(TrainingPlan).where(TrainingPlan.user_id == user_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/week", response_model=s.WeekOut)
def week(user_id: UserId, db: Db):
    today = user_today(db, user_id)
    plan = db.get(TrainingPlan, user_id)
    score = wp.today_recovery(db, user_id, today)
    if plan is None:
        return {
            "plan": None,
            "today": today,
            "recovery": {"score": score, "adjustment": wp.adjustment_for(score)},
            "days": [],
            "gym_empty": False,
        }
    wp.lay_out(db, user_id, plan, today)
    db.commit()
    end = today.toordinal() + wp.HORIZON_DAYS
    rows = list(
        db.scalars(
            select(PlannedWorkout)
            .where(PlannedWorkout.user_id == user_id, PlannedWorkout.plan_date >= today, PlannedWorkout.plan_date < date.fromordinal(end))
            .order_by(PlannedWorkout.plan_date)
        )
    )
    gym_empty = db.scalar(select(GymEquipment.id).where(GymEquipment.user_id == user_id).limit(1)) is None
    return {
        "plan": _plan_out(plan),
        "today": today,
        "recovery": {"score": score, "adjustment": wp.adjustment_for(score)},
        "days": _days(db, rows, today, score),
        "gym_empty": gym_empty,
    }


@router.get("/days/{day_id}", response_model=s.PlannedDay)
def day(day_id: uuid.UUID, user_id: UserId, db: Db):
    row = get_owned(db, PlannedWorkout, day_id, user_id)
    today = user_today(db, user_id)
    score = wp.today_recovery(db, user_id, today) if row.plan_date == today else None
    return _days(db, [row], today, score)[0]


@router.post("/days/{day_id}/start", response_model=SessionDetail, status_code=status.HTTP_201_CREATED)
def start_day(day_id: uuid.UUID, user_id: UserId, db: Db, body: s.StartIn | None = None):
    """Makes the day's session, already filled: its exercises in order, today's number of sets (after recovery), the
    plan's rest, and last time's weights and reps (or the low end of the rep range for a first time). Starting it
    again returns the same session."""
    row = get_owned(db, PlannedWorkout, day_id, user_id)
    if row.workout_id is not None and (existing := db.get(Workout, row.workout_id)) is not None and existing.user_id == user_id:
        return _detail(db, existing)
    today = user_today(db, user_id)
    score = wp.today_recovery(db, user_id, today) if row.plan_date == today else None
    adjustment = wp.adjustment_for(score)
    name = body.type.strip() if body and body.type else DAY_NAMES[row.kind]
    workout = Workout(user_id=user_id, type=name, logged_at=datetime.now(UTC), in_progress=True)
    db.add(workout)
    db.flush()
    entries = _exercises(db, [row.id])[row.id]
    for position, (entry, sets) in enumerate(wp.adjusted_sets(entries, adjustment)):
        added = _add_exercise(
            db,
            user_id,
            workout,
            ExerciseAdd(
                exercise_id=entry.exercise_id, name=None if entry.exercise_id else entry.name, rest_seconds=entry.rest_seconds, sets=sets
            ),
            position,
        )
        db.flush()
        for set_row in db.scalars(select(WorkoutSet).where(WorkoutSet.workout_exercise_id == added.id)):
            if set_row.reps is None:
                set_row.reps = entry.reps_low
    row.workout_id = workout.id
    row.adjustment = adjustment
    row.recovery_score = score
    db.commit()
    db.refresh(workout)
    return _detail(db, workout)


@router.post("/days/{day_id}/move", response_model=s.MoveOut)
def move_day(day_id: uuid.UUID, user_id: UserId, db: Db):
    """ "Not going today": moves the day to tomorrow and shifts the days after it as needed (see move_later)."""
    row = get_owned(db, PlannedWorkout, day_id, user_id)
    if row.workout_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This workout was already started.")
    if row.plan_date < user_today(db, user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This day has passed.")
    moved = wp.move_later(db, user_id, row)
    db.commit()
    return {"date": moved}


def _alternatives(db: Session, user_id: uuid.UUID, muscle: str, mechanic: str | None, exclude: set[str]) -> list[dict[str, Any]]:
    plan = db.get(TrainingPlan, user_id)
    fit = wp.load_fit(db, user_id, plan.level if plan else "intermediate")
    rows = wp.alternatives(db, user_id, muscle=muscle, mechanic=mechanic, exclude=exclude, level=fit.level)
    return [
        {
            "id": row.id,
            "name": row.name,
            "equipment": row.equipment,
            "mechanic": row.mechanic,
            "level": row.level,
            "image_url": wp.describe(row)["image_url"],
            "done_before": row.id in fit.done_before,
        }
        for row in rows
    ]


@router.get("/exercises/{entry_id}/alternatives", response_model=list[s.Alternative])
def plan_alternatives(entry_id: uuid.UUID, user_id: UserId, db: Db):
    entry = get_owned(db, PlannedExercise, entry_id, user_id)
    current = db.get(Exercise, entry.exercise_id) if entry.exercise_id else None
    mechanic = wp.SLOTS[entry.slot].mechanic if entry.slot in wp.SLOTS else (current.mechanic if current else None)
    same_day = set(db.scalars(select(PlannedExercise.exercise_id).where(PlannedExercise.planned_workout_id == entry.planned_workout_id)))
    return _alternatives(db, user_id, entry.muscle, mechanic, {item for item in same_day if item})


def _swap_target(db: Session, exercise_id: str) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Exercise not found.")
    return exercise


@router.post("/exercises/{entry_id}/swap", response_model=s.PlannedDay)
def plan_swap(entry_id: uuid.UUID, body: s.SwapIn, user_id: UserId, db: Db):
    """Puts another exercise in this slot of the day. Only this day changes."""
    entry = get_owned(db, PlannedExercise, entry_id, user_id)
    row = get_owned(db, PlannedWorkout, entry.planned_workout_id, user_id)
    if row.workout_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This workout was already started; swap it in the workout.")
    exercise = _swap_target(db, body.exercise_id)
    if entry.swapped_from is None and entry.exercise_id != exercise.id:
        entry.swapped_from = entry.exercise_id
    elif entry.swapped_from == exercise.id:
        entry.swapped_from = None
    entry.exercise_id, entry.name = exercise.id, exercise.name
    db.commit()
    today = user_today(db, user_id)
    score = wp.today_recovery(db, user_id, today) if row.plan_date == today else None
    return _days(db, [row], today, score)[0]


@session_router.get("/{entry_id}/alternatives", response_model=list[s.Alternative])
def session_alternatives(entry_id: uuid.UUID, user_id: UserId, db: Db):
    entry = get_owned(db, WorkoutExercise, entry_id, user_id)
    found = wp.slot_of(db.get(Exercise, entry.exercise_id) if entry.exercise_id else None)
    if found is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only an exercise from the library can be swapped.")
    in_session = set(db.scalars(select(WorkoutExercise.exercise_id).where(WorkoutExercise.workout_id == entry.workout_id)))
    return _alternatives(db, user_id, found[0], found[1], {item for item in in_session if item})


@session_router.post("/{entry_id}/swap", response_model=SessionDetail)
def session_swap(entry_id: uuid.UUID, body: s.SwapIn, user_id: UserId, db: Db):
    """The machine is busy: this exercise becomes another one. Its sets keep their number, refilled with last time's
    weights and reps for the new exercise (or emptied for a first time). Not once a set has been ticked."""
    entry = get_owned(db, WorkoutExercise, entry_id, user_id)
    sets = list(db.scalars(select(WorkoutSet).where(WorkoutSet.workout_exercise_id == entry.id).order_by(WorkoutSet.position)))
    if any(row.done for row in sets):
        raise HTTPException(status.HTTP_409_CONFLICT, "Sets of this exercise are already done; add the other exercise instead.")
    exercise = _swap_target(db, body.exercise_id)
    entry.exercise_id, entry.name = exercise.id, exercise.name
    history = _past(db, user_id, exercise.id, exercise.name, entry.workout_id)
    last = history[0][1] if history else []
    for index, row in enumerate(sets):
        template = last[min(index, len(last) - 1)] if last else None
        row.weight = template.weight if template else None
        row.unit = template.unit if template else row.unit
        if template is not None:
            row.reps = template.reps
    db.commit()
    return _detail(db, get_owned(db, Workout, entry.workout_id, user_id))


ROUTERS: list[APIRouter] = [router, session_router]
