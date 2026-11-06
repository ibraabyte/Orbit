"""Gym sessions logged set by set, each exercise's history and personal bests, and body measurements.

A session is a workout row with in_progress true until /finish. Its exercises and sets are edited one row at a time
with the plain owner-scoped routes (/workout-exercises, /workout-sets), so a dropped connection loses one tap at most.
History and bests count only sets marked done, and bests leave warm-ups out.
"""

import uuid
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.crud import get_owned, owned_crud_router
from app.deps import Db, UserId
from app.models import BodyMeasurement, Exercise, Workout, WorkoutExercise, WorkoutSet
from app.schemas import training as s
from app.services import exercise_catalog as catalog

router = APIRouter(prefix="/training", tags=["training"])

LB_IN_KG = 0.45359237
# Epley's one-rep max is only a fair guess for sets up to about 12 reps.
ONE_REP_MAX_REPS = 12


def _now() -> datetime:
    return datetime.now(UTC)


def _kg(weight: Any, unit: str) -> float:
    value = float(weight or 0)
    return value * LB_IN_KG if unit == "lb" else value


def _volume_kg(sets: list[WorkoutSet]) -> float:
    return round(sum(_kg(row.weight, row.unit) * (row.reps or 0) for row in sets if row.done and not row.warmup), 1)


def _sets_by_exercise(db: Session, exercise_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[WorkoutSet]]:
    grouped: dict[uuid.UUID, list[WorkoutSet]] = defaultdict(list)
    if exercise_ids:
        query = select(WorkoutSet).where(WorkoutSet.workout_exercise_id.in_(exercise_ids))
        query = query.order_by(WorkoutSet.position, WorkoutSet.created_at)
        for row in db.scalars(query):
            grouped[row.workout_exercise_id].append(row)
    return grouped


def _detail(db: Session, workout: Workout) -> dict[str, Any]:
    exercises = list(
        db.scalars(
            select(WorkoutExercise)
            .where(WorkoutExercise.workout_id == workout.id)
            .order_by(WorkoutExercise.position, WorkoutExercise.created_at)
        )
    )
    sets = _sets_by_exercise(db, [row.id for row in exercises])
    catalogue_ids = {row.exercise_id for row in exercises if row.exercise_id}
    images = {}
    if catalogue_ids:
        for exercise_id, paths in db.execute(select(Exercise.id, Exercise.images).where(Exercise.id.in_(catalogue_ids))):
            images[exercise_id] = catalog.image_url(paths[0]) if paths else None
    return {
        "id": workout.id,
        "type": workout.type,
        "logged_at": workout.logged_at,
        "duration_minutes": workout.duration_minutes,
        "notes": workout.notes,
        "in_progress": workout.in_progress,
        "exercises": [
            {**s.ExerciseRow.model_validate(row).model_dump(), "sets": sets[row.id], "image_url": images.get(row.exercise_id)}
            for row in exercises
        ],
    }


def _same_exercise(user_id: uuid.UUID, exercise_id: str | None, name: str):
    """Rows for the same exercise in any session: by catalogue id, or by name for a typed-in one."""
    if exercise_id:
        return (WorkoutExercise.user_id == user_id, WorkoutExercise.exercise_id == exercise_id)
    same_name = func.lower(WorkoutExercise.name) == name.strip().lower()
    return (WorkoutExercise.user_id == user_id, WorkoutExercise.exercise_id.is_(None), same_name)


Past = list[tuple[Workout, list[WorkoutSet]]]


def _past(db: Session, user_id: uuid.UUID, exercise_id: str | None, name: str, exclude: uuid.UUID | None) -> Past:
    """[(workout, done sets)] newest first, for one exercise."""
    query = (
        select(WorkoutExercise, Workout)
        .join(Workout, (Workout.id == WorkoutExercise.workout_id) & (Workout.user_id == WorkoutExercise.user_id))
        .where(*_same_exercise(user_id, exercise_id, name))
        .order_by(Workout.logged_at.desc(), WorkoutExercise.position)
    )
    if exclude is not None:
        query = query.where(Workout.id != exclude)
    rows = db.execute(query).all()
    sets = _sets_by_exercise(db, [entry.id for entry, _ in rows])
    out: Past = []
    for entry, workout in rows:
        done = [row for row in sets[entry.id] if row.done]
        if not done:
            continue
        # The same exercise twice in one session counts as one session.
        if out and out[-1][0].id == workout.id:
            out[-1][1].extend(done)
        else:
            out.append((workout, done))
    return out


def _best(workout: Workout, row: WorkoutSet, value: float) -> dict[str, Any]:
    return {
        "workout_id": workout.id,
        "logged_at": workout.logged_at,
        "weight": float(row.weight) if row.weight is not None else None,
        "unit": row.unit,
        "reps": row.reps,
        "value": round(value, 1),
    }


def _bests(history: Past) -> dict[str, Any]:
    heaviest = one_rep_max = most_reps = best_volume = None
    keys: dict[str, tuple] = {}
    # Oldest first, so on a tie the first time it was done stays the record.
    for workout, sets in reversed(history):
        for row in sets:
            if row.warmup or not row.reps:
                continue
            kg = _kg(row.weight, row.unit)
            if row.weight and (heaviest is None or (kg, row.reps) > keys["heaviest"]):
                heaviest, keys["heaviest"] = _best(workout, row, float(row.weight)), (kg, row.reps)
            if row.weight and row.reps <= ONE_REP_MAX_REPS:
                estimate = kg * (1 + row.reps / 30) if row.reps > 1 else kg
                if one_rep_max is None or estimate > keys["one_rep_max"][0]:
                    shown = estimate / LB_IN_KG if row.unit == "lb" else estimate
                    one_rep_max, keys["one_rep_max"] = _best(workout, row, shown), (estimate,)
            if most_reps is None or (row.reps, kg) > keys["most_reps"]:
                most_reps, keys["most_reps"] = _best(workout, row, row.reps), (row.reps, kg)
        volume = _volume_kg(sets)
        if volume and (best_volume is None or volume > keys["best_volume"][0]):
            top = max((row for row in sets if not row.warmup), key=lambda row: _kg(row.weight, row.unit) * (row.reps or 0))
            best_volume, keys["best_volume"] = _best(workout, top, volume), (volume,)
    return {"heaviest": heaviest, "one_rep_max": one_rep_max, "most_reps": most_reps, "best_volume": best_volume}


def _brief(row: WorkoutSet) -> dict[str, Any]:
    return {"weight": float(row.weight) if row.weight is not None else None, "unit": row.unit, "reps": row.reps, "warmup": row.warmup}


def _session(db: Session, workout_id: uuid.UUID, user_id: uuid.UUID) -> Workout:
    return get_owned(db, Workout, workout_id, user_id)


def _add_exercise(db: Session, user_id: uuid.UUID, workout: Workout, body: s.ExerciseAdd, position: int) -> WorkoutExercise:
    name = body.name
    if body.exercise_id is not None:
        exercise = db.get(Exercise, body.exercise_id)
        if exercise is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Exercise not found.")
        name = name or exercise.name
    assert name is not None
    entry = WorkoutExercise(user_id=user_id, workout_id=workout.id, exercise_id=body.exercise_id, name=name.strip(), position=position)
    history = _past(db, user_id, body.exercise_id, name, workout.id)
    last = history[0][1] if history else []
    # Same rest as last time unless the app asks for another.
    if body.rest_seconds is not None:
        entry.rest_seconds = body.rest_seconds
    else:
        previous = db.scalar(
            select(WorkoutExercise.rest_seconds)
            .join(Workout, Workout.id == WorkoutExercise.workout_id)
            .where(*_same_exercise(user_id, body.exercise_id, name), Workout.id != workout.id)
            .order_by(Workout.logged_at.desc())
            .limit(1)
        )
        if previous is not None:
            entry.rest_seconds = previous
    db.add(entry)
    db.flush()
    # Ready-made rows: last time's sets in order, then the last one repeated if more are asked for.
    for index in range(max(body.sets, 0)):
        template = last[min(index, len(last) - 1)] if last else None
        db.add(
            WorkoutSet(
                user_id=user_id,
                workout_exercise_id=entry.id,
                position=index,
                reps=template.reps if template else None,
                weight=template.weight if template else None,
                unit=template.unit if template else "kg",
                warmup=template.warmup if template and index < len(last) else False,
            )
        )
    return entry


@router.post("/sessions", response_model=s.SessionDetail, status_code=status.HTTP_201_CREATED)
def start(body: s.SessionStart, user_id: UserId, db: Db):
    workout = Workout(user_id=user_id, type=body.type.strip(), logged_at=body.logged_at or _now(), in_progress=True)
    db.add(workout)
    db.flush()
    if body.repeat_of is not None:
        source = _session(db, body.repeat_of, user_id)
        workout.type = body.type.strip() if "type" in body.model_fields_set else source.type
        for entry in _detail(db, source)["exercises"]:
            copy = WorkoutExercise(
                user_id=user_id,
                workout_id=workout.id,
                exercise_id=entry["exercise_id"],
                name=entry["name"],
                position=entry["position"],
                rest_seconds=entry["rest_seconds"],
            )
            db.add(copy)
            db.flush()
            for row in entry["sets"]:
                db.add(
                    WorkoutSet(
                        user_id=user_id,
                        workout_exercise_id=copy.id,
                        position=row.position,
                        reps=row.reps,
                        weight=row.weight,
                        unit=row.unit,
                        warmup=row.warmup,
                    )
                )
    db.commit()
    db.refresh(workout)
    return _detail(db, workout)


@router.get("/active", response_model=s.SessionDetail | None)
def active(user_id: UserId, db: Db):
    """The session still going, newest first if there are several."""
    workout = db.scalar(select(Workout).where(Workout.user_id == user_id, Workout.in_progress).order_by(Workout.logged_at.desc()).limit(1))
    return _detail(db, workout) if workout else None


@router.get("/sessions", response_model=list[s.SessionSummary])
def sessions(user_id: UserId, db: Db, limit: int = Query(30, ge=1, le=200), offset: int = Query(0, ge=0)):
    """Sessions logged set by set (and ones still going), newest first. One-line workouts are left out."""
    has_exercises = select(WorkoutExercise.id).where(WorkoutExercise.workout_id == Workout.id).exists()
    workouts = list(
        db.scalars(
            select(Workout)
            .where(Workout.user_id == user_id, Workout.in_progress | has_exercises)
            .order_by(Workout.logged_at.desc(), Workout.id)
            .limit(limit)
            .offset(offset)
        )
    )
    entries: dict[uuid.UUID, list[WorkoutExercise]] = defaultdict(list)
    if workouts:
        ids = [row.id for row in workouts]
        query = select(WorkoutExercise).where(WorkoutExercise.workout_id.in_(ids)).order_by(WorkoutExercise.position)
        for entry in db.scalars(query):
            entries[entry.workout_id].append(entry)
    sets = _sets_by_exercise(db, [entry.id for group in entries.values() for entry in group])
    out = []
    for workout in workouts:
        done = [row for entry in entries[workout.id] for row in sets[entry.id] if row.done]
        out.append(
            {
                "id": workout.id,
                "type": workout.type,
                "logged_at": workout.logged_at,
                "duration_minutes": workout.duration_minutes,
                "in_progress": workout.in_progress,
                "exercise_names": [entry.name for entry in entries[workout.id]],
                "sets_done": len(done),
                "volume_kg": _volume_kg(done),
            }
        )
    return out


@router.get("/sessions/{workout_id}", response_model=s.SessionDetail)
def session(workout_id: uuid.UUID, user_id: UserId, db: Db):
    return _detail(db, _session(db, workout_id, user_id))


@router.post("/sessions/{workout_id}/finish", response_model=s.SessionDetail)
def finish(workout_id: uuid.UUID, body: s.SessionFinish, user_id: UserId, db: Db):
    workout = _session(db, workout_id, user_id)
    ended = body.ended_at or _now()
    workout.in_progress = False
    workout.duration_minutes = max(0, round((ended - workout.logged_at).total_seconds() / 60))
    db.commit()
    db.refresh(workout)
    return _detail(db, workout)


@router.post("/sessions/{workout_id}/exercises", response_model=s.SessionDetail, status_code=status.HTTP_201_CREATED)
def add_exercise(workout_id: uuid.UUID, body: s.ExerciseAdd, user_id: UserId, db: Db):
    workout = _session(db, workout_id, user_id)
    last = db.scalar(select(func.max(WorkoutExercise.position)).where(WorkoutExercise.workout_id == workout.id))
    _add_exercise(db, user_id, workout, body, 0 if last is None else last + 1)
    db.commit()
    return _detail(db, workout)


@router.get("/history", response_model=s.ExerciseHistory)
def history(
    user_id: UserId,
    db: Db,
    exercise_id: str | None = Query(None, max_length=200),
    name: str | None = Query(None, min_length=1, max_length=160),
    exclude_workout: uuid.UUID | None = None,
    limit: int = Query(10, ge=1, le=100),
):
    """One exercise across sessions: the recent ones (sets marked done) and the personal bests over all of them.
    exclude_workout leaves a session out, so "last time" and the bests are from before it."""
    if not exercise_id and not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Send exercise_id or name.")
    past = _past(db, user_id, exercise_id, name or "", exclude_workout)
    return {
        "sessions": [
            {"workout_id": workout.id, "logged_at": workout.logged_at, "sets": [_brief(row) for row in sets], "volume_kg": _volume_kg(sets)}
            for workout, sets in past[:limit]
        ],
        "bests": _bests(past),
    }


def _stamp_done(row: WorkoutSet, fields: set[str] | None = None) -> None:
    if fields is None or "done" in fields:
        row.done_at = _now() if row.done else None


exercises = owned_crud_router(
    WorkoutExercise,
    prefix="/workout-exercises",
    create=s.WorkoutExerciseCreate,
    update=s.WorkoutExerciseUpdate,
    order_by=WorkoutExercise.created_at.desc(),
)
sets = owned_crud_router(
    WorkoutSet,
    prefix="/workout-sets",
    create=s.WorkoutSetCreate,
    update=s.WorkoutSetUpdate,
    order_by=WorkoutSet.created_at.desc(),
    max_limit=1000,
    after_create=lambda db, row: _stamp_done(row),
    after_update=_stamp_done,
)
measurements = owned_crud_router(
    BodyMeasurement,
    prefix="/body-measurements",
    create=s.BodyMeasurementCreate,
    update=s.BodyMeasurementUpdate,
    order_by=BodyMeasurement.measured_at.desc(),
    max_limit=1000,
)

ROUTERS: list[APIRouter] = [router, exercises, sets, measurements]
