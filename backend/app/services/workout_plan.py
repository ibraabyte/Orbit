"""Lays out the automatic workout plan, fits it to the day's recovery, moves a day, and finds swaps.

The plan is a split (full body, push/pull/legs, upper/lower…) chosen from how many days a week the user trains.
Each kind of day is a list of slots ("chest_press", "row", "squat"…), and each slot is filled with one exercise
from the catalogue that the user's gym can do and that no active injury rules out (the same rules as the library,
app/services/exercise_catalog.py). Well-known lifts come first, in the order listed; an exercise the user has
logged before wins among them. When none of those fits, any catalogue exercise for the slot's muscle can.

Days are laid out lazily, a week ahead, whenever the plan is read. A slot whose muscle is injured is left out of
the day; a day where nothing fits is still laid out (empty) so the week keeps its shape.

Recovery: on the day itself, WHOOP's recovery score (if it synced one for today) changes what the day asks for.
Under 34 (WHOOP red) the app suggests resting or moving the day, and the workout is the light one; 34 to 66 is
light (one set fewer per exercise, never under two, and the last exercise dropped when there are more than four);
85 and up adds a set to the first two exercises. No score for today leaves the plan as it is.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import Exercise, GymEquipment, Injury, PlannedExercise, PlannedWorkout, TrainingPlan, WorkoutExercise
from app.models.fitness import NO_EQUIPMENT
from app.services import exercise_catalog as catalog
from app.services import sections
from app.services.whoop_analytics import load_summary

HORIZON_DAYS = 7
RED, YELLOW, PUSH = 34, 67, 85


@dataclass(frozen=True)
class Slot:
    muscle: str
    mechanic: str
    # Catalogue ids in order of preference: staple lifts most people know, with a no-equipment one last.
    staples: tuple[str, ...]


SLOTS: dict[str, Slot] = {
    "chest_press": Slot(
        "chest",
        "compound",
        ("Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Bench_Press", "Machine_Bench_Press", "Leverage_Chest_Press", "Pushups"),
    ),
    "incline_press": Slot(
        "chest",
        "compound",
        (
            "Incline_Dumbbell_Press",
            "Barbell_Incline_Bench_Press_-_Medium_Grip",
            "Leverage_Incline_Chest_Press",
            "Smith_Machine_Incline_Bench_Press",
            "Pushups",
        ),
    ),
    "chest_fly": Slot("chest", "isolation", ("Butterfly", "Dumbbell_Flyes", "Flat_Bench_Cable_Flyes", "Incline_Dumbbell_Flyes")),
    "shoulder_press": Slot(
        "shoulders",
        "compound",
        (
            "Dumbbell_Shoulder_Press",
            "Seated_Dumbbell_Press",
            "Machine_Shoulder_Military_Press",
            "Leverage_Shoulder_Press",
            "Barbell_Shoulder_Press",
            "Seated_Cable_Shoulder_Press",
            "Shoulder_Press_-_With_Bands",
        ),
    ),
    "lateral_raise": Slot(
        "shoulders",
        "isolation",
        ("Side_Lateral_Raise", "Cable_Seated_Lateral_Raise", "Seated_Side_Lateral_Raise", "Lateral_Raise_-_With_Bands"),
    ),
    "rear_delt": Slot(
        "shoulders", "isolation", ("Face_Pull", "Reverse_Machine_Flyes", "Reverse_Flyes", "Cable_Rear_Delt_Fly", "Band_Pull_Apart")
    ),
    "triceps": Slot(
        "triceps",
        "isolation",
        ("Triceps_Pushdown_-_Rope_Attachment", "Triceps_Pushdown", "EZ-Bar_Skullcrusher", "Dip_Machine", "Bench_Dips"),
    ),
    "vertical_pull": Slot(
        "lats", "compound", ("Wide-Grip_Lat_Pulldown", "Close-Grip_Front_Lat_Pulldown", "Leverage_Iso_Row", "Pullups", "Chin-Up")
    ),
    "row": Slot(
        "middle back",
        "compound",
        (
            "Seated_Cable_Rows",
            "One-Arm_Dumbbell_Row",
            "Bent_Over_Barbell_Row",
            "Leverage_High_Row",
            "Bent_Over_Two-Dumbbell_Row",
            "Inverted_Row",
        ),
    ),
    "biceps": Slot(
        "biceps",
        "isolation",
        ("Barbell_Curl", "Dumbbell_Bicep_Curl", "Hammer_Curls", "Cable_Hammer_Curls_-_Rope_Attachment", "Machine_Bicep_Curl"),
    ),
    "squat": Slot(
        "quadriceps", "compound", ("Barbell_Squat", "Leg_Press", "Hack_Squat", "Goblet_Squat", "Dumbbell_Squat", "Bodyweight_Squat")
    ),
    "lunge": Slot("quadriceps", "compound", ("Dumbbell_Lunges", "Barbell_Walking_Lunge", "Dumbbell_Step_Ups", "Bodyweight_Walking_Lunge")),
    "leg_extension": Slot("quadriceps", "isolation", ("Leg_Extensions", "Single-Leg_Leg_Extension")),
    "hinge": Slot(
        "hamstrings",
        "compound",
        (
            "Romanian_Deadlift",
            "Stiff-Legged_Dumbbell_Deadlift",
            "Stiff-Legged_Barbell_Deadlift",
            "Kettlebell_One-Legged_Deadlift",
            "Natural_Glute_Ham_Raise",
        ),
    ),
    "leg_curl": Slot("hamstrings", "isolation", ("Lying_Leg_Curls", "Seated_Leg_Curl", "Standing_Leg_Curl", "Ball_Leg_Curl")),
    "glutes": Slot("glutes", "compound", ("Barbell_Hip_Thrust", "Barbell_Glute_Bridge", "Single_Leg_Glute_Bridge", "Butt_Lift_Bridge")),
    "calves": Slot(
        "calves", "isolation", ("Standing_Calf_Raises", "Seated_Calf_Raise", "Standing_Dumbbell_Calf_Raise", "Calf_Raises_-_With_Bands")
    ),
    "core": Slot("abdominals", "isolation", ("Cable_Crunch", "Plank", "Crunches", "Dead_Bug")),
}

DAYS: dict[str, tuple[str, ...]] = {
    "full_a": ("squat", "chest_press", "row", "shoulder_press", "leg_curl", "core"),
    "full_b": ("hinge", "incline_press", "vertical_pull", "lunge", "lateral_raise", "core"),
    "push": ("chest_press", "shoulder_press", "incline_press", "lateral_raise", "triceps", "chest_fly"),
    "pull": ("vertical_pull", "row", "rear_delt", "biceps", "core"),
    "legs": ("squat", "hinge", "leg_extension", "leg_curl", "calves", "core"),
    "upper": ("chest_press", "row", "shoulder_press", "vertical_pull", "biceps", "triceps"),
    "lower": ("squat", "hinge", "lunge", "leg_curl", "calves", "core"),
}

# sets, lowest reps, highest reps, rest in seconds; for big lifts and for small ones.
DOSES: dict[str, dict[str, tuple[int, int, int, int]]] = {
    "strength": {"compound": (5, 3, 6, 180), "isolation": (3, 6, 10, 90)},
    "muscle": {"compound": (4, 6, 10, 120), "isolation": (3, 10, 15, 75)},
    "fitness": {"compound": (3, 8, 12, 90), "isolation": (3, 12, 15, 60)},
    "fat_loss": {"compound": (3, 10, 15, 60), "isolation": (3, 12, 20, 45)},
}


def split_for(days: int, level: str) -> tuple[str, ...]:
    """The cycle of day kinds for this many training days a week."""
    if days <= 2 or (days == 3 and level == "beginner"):
        return ("full_a", "full_b")
    if days == 3:
        return ("push", "pull", "legs")
    if days == 4:
        return ("upper", "lower")
    if days == 5:
        return ("push", "pull", "legs", "upper", "lower")
    return ("push", "pull", "legs")


def dose(goal: str, level: str, mechanic: str) -> tuple[int, int, int, int]:
    sets, low, high, rest = DOSES[goal][mechanic]
    # A beginner starts with a set fewer on the big lifts.
    if level == "beginner" and mechanic == "compound":
        sets = max(3, sets - 1)
    return sets, low, high, rest


# --- Fitting exercises to the user ---------------------------------------------------------------------------------


@dataclass
class Fit:
    """What the user's gym has, which muscles are injured, and what they have done before."""

    gym: frozenset[str]
    covered: dict[str, list[str]]
    level: str
    done_before: frozenset[str]

    def allows(self, exercise: Exercise) -> bool:
        if exercise.equipment not in (None, NO_EQUIPMENT) and exercise.equipment not in self.gym:
            return False
        if any(muscle in self.covered for muscle in exercise.primary_muscles):
            return False
        return self.level == "advanced" or exercise.level != "expert"


def load_fit(db: Session, user_id: uuid.UUID, level: str) -> Fit:
    gym = frozenset(db.scalars(select(GymEquipment.equipment).where(GymEquipment.user_id == user_id)))
    areas = list(db.scalars(select(Injury.area).where(Injury.user_id == user_id, Injury.active)))
    done = frozenset(
        db.scalars(
            select(WorkoutExercise.exercise_id)
            .where(WorkoutExercise.user_id == user_id, WorkoutExercise.exercise_id.is_not(None))
            .distinct()
        )
    )
    return Fit(gym=gym, covered=catalog.muscles_for(areas), level=level, done_before=done)  # type: ignore[arg-type]


def _catalogue(db: Session, muscle: str) -> list[Exercise]:
    """Strength exercises whose main muscle is this one."""
    query = select(Exercise).where(Exercise.primary_muscles.contains([muscle]), Exercise.category.in_(("strength", "powerlifting")))
    return list(db.scalars(query.order_by(Exercise.name, Exercise.id)))


def ranked(db: Session, slot: Slot, fit: Fit, *, any_staple: bool = False) -> list[Exercise]:
    """Exercises that can fill the slot, best first. With any_staple, staples of every slot for the same muscle count."""
    pool = {row.id: row for row in _catalogue(db, slot.muscle) if fit.allows(row)}
    staples = list(slot.staples)
    if any_staple:
        staples += [staple for other in SLOTS.values() if other.muscle == slot.muscle for staple in other.staples if staple not in staples]
    order = {exercise_id: index for index, exercise_id in enumerate(staples)}

    def key(row: Exercise) -> tuple:
        staple = order.get(row.id)
        return (
            staple is None,
            row.id not in fit.done_before,
            staple if staple is not None else 0,
            row.mechanic != slot.mechanic,
            row.level != "beginner",
            row.name,
        )

    return sorted(pool.values(), key=key)


# --- Laying out days -----------------------------------------------------------------------------------------------


def _fill(db: Session, user_id: uuid.UUID, planned: PlannedWorkout, plan: TrainingPlan, fit: Fit) -> None:
    used: set[str] = set()
    position = 0
    for slot_key in DAYS[planned.kind]:
        slot = SLOTS[slot_key]
        choice = next((row for row in ranked(db, slot, fit) if row.id not in used), None)
        if choice is None:
            continue
        used.add(choice.id)
        sets, low, high, rest = dose(plan.goal, plan.level, slot.mechanic)
        db.add(
            PlannedExercise(
                user_id=user_id,
                planned_workout_id=planned.id,
                exercise_id=choice.id,
                name=choice.name,
                slot=slot_key,
                muscle=slot.muscle,
                position=position,
                sets=sets,
                reps_low=low,
                reps_high=high,
                rest_seconds=rest,
            )
        )
        position += 1


def lay_out(db: Session, user_id: uuid.UUID, plan: TrainingPlan, today: date, *, restart: bool = False) -> None:
    """Adds the plan's days from where it left off up to a week ahead. Never touches a day already laid out."""
    split = split_for(len(plan.weekdays), plan.level)
    last = db.scalar(select(PlannedWorkout).where(PlannedWorkout.user_id == user_id).order_by(PlannedWorkout.plan_date.desc()).limit(1))
    rotation = 0
    start = today
    if last is not None:
        start = max(today, last.plan_date + timedelta(days=1))
        if not restart and split[last.rotation % len(split)] == last.kind:
            rotation = (last.rotation + 1) % len(split)
    fit: Fit | None = None
    day = start
    while day < today + timedelta(days=HORIZON_DAYS):
        if day.weekday() in plan.weekdays:
            fit = fit or load_fit(db, user_id, plan.level)
            planned = PlannedWorkout(user_id=user_id, plan_date=day, kind=split[rotation], rotation=rotation)
            db.add(planned)
            db.flush()
            _fill(db, user_id, planned, plan, fit)
            rotation = (rotation + 1) % len(split)
        day += timedelta(days=1)
    db.flush()


def clear_upcoming(db: Session, user_id: uuid.UUID, today: date) -> None:
    """Drops the days from today on that were not started, so a changed plan lays them out again."""
    db.execute(
        delete(PlannedWorkout).where(
            PlannedWorkout.user_id == user_id, PlannedWorkout.plan_date >= today, PlannedWorkout.workout_id.is_(None)
        )
    )
    db.flush()


def move_later(db: Session, user_id: uuid.UUID, planned: PlannedWorkout) -> date:
    """ "Not going today": the day moves to the next day. A day already planned there moves on by one too, and so on,
    so the order of the week stays and nothing is lost; a day already started stays where it is and is stepped over.
    Returns the new date."""
    rows = {
        row.plan_date: row
        for row in db.scalars(select(PlannedWorkout).where(PlannedWorkout.user_id == user_id, PlannedWorkout.plan_date > planned.plan_date))
    }
    queue = [planned]
    targets: list[tuple[PlannedWorkout, date]] = []
    cursor = planned.plan_date + timedelta(days=1)
    while queue:
        moving = queue.pop(0)
        while (blocker := rows.get(cursor)) is not None and blocker.workout_id is not None:
            cursor += timedelta(days=1)
        if blocker is not None:
            queue.append(blocker)
        targets.append((moving, cursor))
        cursor += timedelta(days=1)
    # Latest first, so each date is free by the time a row moves onto it.
    for row, target in sorted(targets, key=lambda pair: pair[1], reverse=True):
        row.plan_date = target
        db.flush()
    return targets[0][1]


# --- Recovery --------------------------------------------------------------------------------------------------------


def today_recovery(db: Session, user_id: uuid.UUID, today: date) -> float | None:
    """WHOOP's recovery score for today, when it synced one and WHOOP isn't switched off in Settings."""
    if "whoop" in sections.hidden_for(db, user_id):
        return None
    summary = load_summary(db, user_id, today=today, days=1)
    row = summary["daily"][-1] if summary["daily"] else {}
    return row.get("recovery") if row.get("date") == today.isoformat() else None


def adjustment_for(score: float | None) -> str:
    if score is None:
        return "none"
    if score < RED:
        return "rest"
    if score < YELLOW:
        return "light"
    return "push" if score >= PUSH else "normal"


def adjusted_sets(exercises: list[PlannedExercise], adjustment: str) -> list[tuple[PlannedExercise, int]]:
    """(exercise, sets for today) after the recovery change. A dropped exercise is left out."""
    if adjustment in ("rest", "light"):
        kept = exercises[:-1] if len(exercises) > 4 else exercises
        return [(row, max(2, row.sets - 1)) for row in kept]
    if adjustment == "push":
        return [(row, min(row.sets + 1, 6) if index < 2 else row.sets) for index, row in enumerate(exercises)]
    return [(row, row.sets) for row in exercises]


# --- Swaps ------------------------------------------------------------------------------------------------------------


def alternatives(
    db: Session, user_id: uuid.UUID, *, muscle: str, mechanic: str | None, exclude: Iterable[str], level: str, limit: int = 8
) -> list[Exercise]:
    """Other exercises for the same muscle that the user's gym can do, best first."""
    fit = load_fit(db, user_id, level)
    slot = Slot(muscle, mechanic or "compound", ())
    skip = set(exclude)
    return [row for row in ranked(db, slot, fit, any_staple=True) if row.id not in skip][:limit]


def slot_of(exercise: Exercise | None) -> tuple[str, str | None] | None:
    """The muscle and mechanic a swap for this catalogue exercise looks for."""
    if exercise is None or not exercise.primary_muscles:
        return None
    return exercise.primary_muscles[0], exercise.mechanic


def describe(exercise: Exercise | None) -> dict[str, Any]:
    if exercise is None:
        return {"image_url": None, "equipment": None}
    return {"image_url": catalog.image_url(exercise.images[0]) if exercise.images else None, "equipment": exercise.equipment}
