"""Gym sessions logged set by set, and body measurements.

A session is a `workouts` row (app/models/health.py) with `in_progress` true until it is finished. Its exercises
are `workout_exercises` rows in order, each pointing at a catalogue exercise when it came from the library (or only
a name when the user typed one), and each exercise has its `workout_sets`. Both carry user_id and join their
parent on (id, user_id), so a row can only hang under the same owner's rows.

`body_measurements` holds one number per row (waist 84 cm on a day), so a new kind of measurement needs no new
column. Weight stays in `weight_logs`, which the rest of the app already reads.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

WEIGHT_UNITS = ("kg", "lb")
# Body measurements: lengths around the body, plus body fat in percent.
MEASUREMENT_KINDS = ("waist", "chest", "hips", "arm", "thigh", "calf", "neck", "shoulders", "body_fat")
LENGTH_UNITS = ("cm", "in")
# Rest between sets: off, up to 10 minutes.
MAX_REST_SECONDS = 600


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in values)


class WorkoutExercise(Owned, Base):
    """One exercise in a session, in order. Goes with its session."""

    __tablename__ = "workout_exercises"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 160", name="name_length"),
        CheckConstraint("position >= 0", name="position"),
        CheckConstraint(f"rest_seconds >= 0 and rest_seconds <= {MAX_REST_SECONDS}", name="rest_seconds"),
        CheckConstraint("char_length(note) <= 500", name="note_length"),
        ForeignKeyConstraint(["workout_id", "user_id"], ["workouts.id", "workouts.user_id"], ondelete="CASCADE"),
        UniqueConstraint("id", "user_id"),
        Index("workout_exercises_workout_idx", "workout_id", "position"),
        Index("workout_exercises_user_exercise_idx", "user_id", "exercise_id"),
        Index("workout_exercises_user_name_idx", "user_id", text("lower(name)")),
    )

    workout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # The catalogue exercise, when it came from the library. The name is a copy, so history reads the same
    # if the catalogue renames it; a typed-in exercise has only the name.
    exercise_id: Mapped[str | None] = mapped_column(Text, ForeignKey("exercises.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default="90")
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class WorkoutSet(Owned, Base):
    """One set: weight × reps. Only sets marked done count toward history and personal bests."""

    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("position >= 0", name="position"),
        CheckConstraint("reps is null or (reps >= 0 and reps <= 1000)", name="reps"),
        CheckConstraint("weight is null or (weight >= 0 and weight < 2000)", name="weight"),
        CheckConstraint(f"unit in ({_sql_list(WEIGHT_UNITS)})", name="unit"),
        ForeignKeyConstraint(["workout_exercise_id", "user_id"], ["workout_exercises.id", "workout_exercises.user_id"], ondelete="CASCADE"),
        Index("workout_sets_exercise_idx", "workout_exercise_id", "position"),
        Index("workout_sets_user_idx", "user_id"),
    )

    workout_exercise_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reps: Mapped[int | None] = mapped_column(Integer)
    # Empty for bodyweight sets.
    weight: Mapped[Decimal | None] = mapped_column(Numeric)
    unit: Mapped[str] = mapped_column(Text, nullable=False, server_default="kg")
    # A warm-up set is logged but left out of personal bests.
    warmup: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = updated_at()


class BodyMeasurement(Owned, Base):
    __tablename__ = "body_measurements"
    __table_args__ = (
        CheckConstraint(f"kind in ({_sql_list(MEASUREMENT_KINDS)})", name="kind"),
        CheckConstraint("value > 0 and value < 1000", name="value"),
        # Body fat is a percentage; everything else is a length.
        CheckConstraint(f"(kind = 'body_fat' and unit = '%') or (kind <> 'body_fat' and unit in ({_sql_list(LENGTH_UNITS)}))", name="unit"),
        CheckConstraint("char_length(note) <= 500", name="note_length"),
        Index("body_measurements_user_kind_idx", "user_id", "kind", text("measured_at desc")),
    )

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
