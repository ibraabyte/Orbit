"""Shapes for the automatic workout plan."""

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.plan import ADJUSTMENTS, DAY_KINDS, GOALS, LEVELS
from app.schemas.tasks import Input

Goal = Literal[GOALS]  # type: ignore[valid-type]
Level = Literal[LEVELS]  # type: ignore[valid-type]
DayKind = Literal[DAY_KINDS]  # type: ignore[valid-type]
Adjustment = Literal[ADJUSTMENTS]  # type: ignore[valid-type]


class PlanIn(Input):
    goal: Goal
    level: Level = "intermediate"
    # Python's numbering: Monday 0 … Sunday 6.
    weekdays: list[int] = Field(min_length=1, max_length=7)

    @field_validator("weekdays")
    @classmethod
    def days(cls, value: list[int]) -> list[int]:
        if any(day < 0 or day > 6 for day in value):
            raise ValueError("Weekdays go from 0 (Monday) to 6 (Sunday).")
        return sorted(set(value))


class PlanOut(BaseModel):
    goal: Goal
    level: Level
    weekdays: list[int]


class PlannedExerciseOut(BaseModel):
    id: uuid.UUID
    exercise_id: str | None
    name: str
    slot: str
    muscle: str
    position: int
    # Sets for the day after the recovery change (the same as base_sets on other days).
    sets: int
    base_sets: int
    reps_low: int
    reps_high: int
    rest_seconds: int
    swapped_from: str | None
    image_url: str | None
    equipment: str | None


class PlannedDay(BaseModel):
    id: uuid.UUID
    date: date
    kind: DayKind
    # planned: still ahead; missed: its day passed without starting it; started: a session is going; done: finished.
    status: Literal["planned", "missed", "started", "done"]
    workout_id: uuid.UUID | None
    # Today: what recovery changes (from the live score, or the one kept when it was started). Other days: none.
    adjustment: Adjustment
    recovery_score: float | None
    exercises: list[PlannedExerciseOut]
    # Exercises today's light version leaves out.
    dropped: list[uuid.UUID]


class Recovery(BaseModel):
    score: float | None
    adjustment: Adjustment


class WeekOut(BaseModel):
    plan: PlanOut | None
    today: date
    recovery: Recovery
    # From today, a week ahead; a day without a workout is a rest day.
    days: list[PlannedDay]
    # True when the user hasn't ticked any equipment yet, so the plan sticks to bodyweight exercises.
    gym_empty: bool


class StartIn(Input):
    # The session's name, in the app's language. Defaults to the kind of day in English.
    type: str | None = Field(default=None, min_length=1, max_length=160)


class MoveOut(BaseModel):
    date: date


class SwapIn(Input):
    exercise_id: str = Field(min_length=1, max_length=200)


class Alternative(BaseModel):
    id: str
    name: str
    equipment: str | None
    mechanic: str | None
    level: str
    image_url: str | None
    done_before: bool


def _reps(low: int | None, high: int | None) -> None:
    if low is not None and high is not None and high < low:
        raise ValueError("reps_high can't be under reps_low.")


class PlannedExerciseCreate(Input):
    """Adds an exercise from the library to a coming day of the plan, at its end."""

    planned_workout_id: uuid.UUID
    exercise_id: str = Field(min_length=1, max_length=200)
    sets: int = Field(default=3, ge=1, le=10)
    reps_low: int = Field(default=8, ge=1, le=100)
    reps_high: int = Field(default=12, ge=1, le=100)
    rest_seconds: int = Field(default=90, ge=0, le=600)

    @model_validator(mode="after")
    def reps_fit(self):
        _reps(self.reps_low, self.reps_high)
        return self


class PlannedExerciseUpdate(Input):
    """Changes one exercise of a coming day. A new exercise_id swaps it for that library exercise (like /swap)."""

    exercise_id: str | None = Field(default=None, min_length=1, max_length=200)
    sets: int | None = Field(default=None, ge=1, le=10)
    reps_low: int | None = Field(default=None, ge=1, le=100)
    reps_high: int | None = Field(default=None, ge=1, le=100)
    rest_seconds: int | None = Field(default=None, ge=0, le=600)

    @model_validator(mode="after")
    def reps_fit(self):
        _reps(self.reps_low, self.reps_high)
        return self
