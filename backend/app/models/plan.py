"""The automatic workout plan: the user's choices, and the workouts it lays out day by day.

`training_plans` holds one row per user: the goal, the level and the weekdays they train. From it the server lays
out `planned_workouts` (one per day at most) a week ahead, each with its `planned_exercises` picked from the
catalogue to fit the user's gym and injuries (app/services/workout_plan.py). Starting a planned workout makes an
ordinary training session (app/models/training.py) and links it here, which is how a day becomes done.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Float, ForeignKey, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, created_at, updated_at

GOALS = ("strength", "muscle", "fitness", "fat_loss")
LEVELS = ("beginner", "intermediate", "advanced")
# The kinds of day a split is made of (app/services/workout_plan.py has what each one trains).
DAY_KINDS = ("full_a", "full_b", "push", "pull", "legs", "upper", "lower")
# How the day's recovery changed a workout when it was started.
ADJUSTMENTS = ("none", "rest", "light", "normal", "push")


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in values)


class TrainingPlan(Base):
    """One per user. Weekdays use Python's numbering: Monday 0 … Sunday 6."""

    __tablename__ = "training_plans"
    __table_args__ = (
        CheckConstraint(f"goal in ({_sql_list(GOALS)})", name="goal"),
        CheckConstraint(f"level in ({_sql_list(LEVELS)})", name="level"),
        CheckConstraint("cardinality(weekdays) between 1 and 7 and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]", name="weekdays"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(Text, nullable=False)
    weekdays: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class PlannedWorkout(Owned, Base):
    """One day's workout in the plan. Moving it ("not going today") only changes its date."""

    __tablename__ = "planned_workouts"
    __table_args__ = (
        CheckConstraint(f"kind in ({_sql_list(DAY_KINDS)})", name="kind"),
        CheckConstraint("rotation >= 0", name="rotation"),
        CheckConstraint(f"adjustment is null or adjustment in ({_sql_list(ADJUSTMENTS)})", name="adjustment"),
        CheckConstraint("recovery_score is null or (recovery_score >= 0 and recovery_score <= 100)", name="recovery_score"),
        UniqueConstraint("user_id", "plan_date"),
        UniqueConstraint("id", "user_id"),
    )

    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    # Where this day sits in the split's cycle, so the next one laid out carries on from it.
    rotation: Mapped[int] = mapped_column(Integer, nullable=False)
    # The session made when it was started. The server only ever links the owner's own session.
    workout_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("workouts.id", ondelete="SET NULL"))
    # Kept from the moment it was started: the recovery score then, and what it changed.
    adjustment: Mapped[str | None] = mapped_column(Text)
    recovery_score: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[datetime] = updated_at()


class PlannedExercise(Owned, Base):
    """One exercise of a planned day, in order, with the sets and the rep range to aim for."""

    __tablename__ = "planned_exercises"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 160", name="name_length"),
        CheckConstraint("position >= 0", name="position"),
        CheckConstraint("sets between 1 and 10", name="sets"),
        CheckConstraint("reps_low between 1 and 100 and reps_high between reps_low and 100", name="reps"),
        CheckConstraint("rest_seconds between 0 and 600", name="rest_seconds"),
        ForeignKeyConstraint(["planned_workout_id", "user_id"], ["planned_workouts.id", "planned_workouts.user_id"], ondelete="CASCADE"),
        Index("planned_exercises_workout_idx", "planned_workout_id", "position"),
        Index("planned_exercises_user_idx", "user_id"),
    )

    planned_workout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    exercise_id: Mapped[str | None] = mapped_column(Text, ForeignKey("exercises.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # The slot it fills (e.g. "chest_press") and that slot's muscle, which is what a swap looks for.
    slot: Mapped[str] = mapped_column(Text, nullable=False)
    muscle: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    sets: Mapped[int] = mapped_column(Integer, nullable=False)
    reps_low: Mapped[int] = mapped_column(Integer, nullable=False)
    reps_high: Mapped[int] = mapped_column(Integer, nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    # The exercise the plan first picked, when the user swapped it for another.
    swapped_from: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()
