"""Shapes for gym sessions logged set by set, and body measurements."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models import WorkoutExercise, WorkoutSet
from app.models.training import LENGTH_UNITS, MAX_REST_SECONDS, MEASUREMENT_KINDS, WEIGHT_UNITS
from app.schemas.rows import row_schema
from app.schemas.tasks import Input

WeightUnit = Literal[WEIGHT_UNITS]  # type: ignore[valid-type]
MeasurementKind = Literal[MEASUREMENT_KINDS]  # type: ignore[valid-type]
MeasurementUnit = Literal[(*LENGTH_UNITS, "%")]  # type: ignore[valid-type]
Rest = Field(default=None, ge=0, le=MAX_REST_SECONDS)
Weight = Field(default=None, ge=0, lt=2000)
Reps = Field(default=None, ge=0, le=1000)

ExerciseRow = row_schema(WorkoutExercise)
SetRow = row_schema(WorkoutSet)


class SessionStart(Input):
    type: str = Field(default="Strength", min_length=1, max_length=160)
    logged_at: datetime | None = None
    # Start from a past session: same exercises, same weights and reps, nothing ticked yet.
    repeat_of: uuid.UUID | None = None


class SessionFinish(Input):
    # Defaults to now; the duration is the time from the start to here.
    ended_at: datetime | None = None


class ExerciseAdd(Input):
    """Adds an exercise at the end of a session with `sets` rows ready, filled from the last time it was done."""

    exercise_id: str | None = Field(default=None, max_length=200)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    rest_seconds: int | None = Rest
    sets: int = Field(default=3, ge=0, le=20)

    @model_validator(mode="after")
    def named(self):
        if self.exercise_id is None and self.name is None:
            raise ValueError("Send exercise_id or name.")
        return self


class WorkoutExerciseCreate(Input):
    """A plain row; POST /training/sessions/{id}/exercises is the friendlier way (fills name and sets)."""

    workout_id: uuid.UUID
    exercise_id: str | None = Field(default=None, max_length=200)
    name: str = Field(min_length=1, max_length=160)
    position: int = Field(default=0, ge=0)
    rest_seconds: int = Field(default=90, ge=0, le=MAX_REST_SECONDS)
    note: str | None = Field(default=None, max_length=500)


class WorkoutExerciseUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    position: int | None = Field(default=None, ge=0)
    rest_seconds: int | None = Rest
    note: str | None = Field(default=None, max_length=500)


class WorkoutSetCreate(Input):
    workout_exercise_id: uuid.UUID
    position: int = Field(default=0, ge=0)
    reps: int | None = Reps
    weight: float | None = Weight
    unit: WeightUnit = "kg"
    warmup: bool = False
    done: bool = False


class WorkoutSetUpdate(Input):
    position: int | None = Field(default=None, ge=0)
    reps: int | None = Reps
    weight: float | None = Weight
    unit: WeightUnit | None = None
    warmup: bool | None = None
    done: bool | None = None


class SessionExercise(ExerciseRow):  # type: ignore[valid-type, misc]
    sets: list[SetRow]  # type: ignore[valid-type]
    image_url: str | None


class SessionDetail(BaseModel):
    id: uuid.UUID
    type: str
    logged_at: datetime
    duration_minutes: int | None
    notes: str | None
    in_progress: bool
    exercises: list[SessionExercise]


class SessionSummary(BaseModel):
    id: uuid.UUID
    type: str
    logged_at: datetime
    duration_minutes: int | None
    in_progress: bool
    exercise_names: list[str]
    sets_done: int
    # Sum of weight × reps over done sets, in kilograms.
    volume_kg: float


class SetBrief(BaseModel):
    weight: float | None
    unit: str
    reps: int | None
    warmup: bool


class PastSession(BaseModel):
    workout_id: uuid.UUID
    logged_at: datetime
    sets: list[SetBrief]
    volume_kg: float


class Best(BaseModel):
    workout_id: uuid.UUID
    logged_at: datetime
    weight: float | None
    unit: str
    reps: int | None
    # For the estimated one-rep max and the best session volume, in the set's unit (volume: kilograms).
    value: float


class Bests(BaseModel):
    heaviest: Best | None
    # Epley's estimate from sets of 1 to 12 reps.
    one_rep_max: Best | None
    most_reps: Best | None
    best_volume: Best | None


class ExerciseHistory(BaseModel):
    # Newest first; `sessions[0]` is "last time".
    sessions: list[PastSession]
    bests: Bests


class BodyMeasurementCreate(Input):
    kind: MeasurementKind
    value: float = Field(gt=0, lt=1000)
    unit: MeasurementUnit
    measured_at: datetime
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def unit_fits(self):
        if (self.kind == "body_fat") != (self.unit == "%"):
            raise ValueError("Body fat is in %; other measurements are in cm or in.")
        return self


class BodyMeasurementUpdate(Input):
    value: float | None = Field(default=None, gt=0, lt=1000)
    unit: MeasurementUnit | None = None
    measured_at: datetime | None = None
    note: str | None = Field(default=None, max_length=500)
