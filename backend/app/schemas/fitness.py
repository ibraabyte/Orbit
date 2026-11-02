"""Shapes for the exercise library, gym equipment and injuries."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.models.fitness import GYM_EQUIPMENT, INJURY_AREAS
from app.schemas.tasks import Input

GymItem = Literal[GYM_EQUIPMENT]  # type: ignore[valid-type]
InjuryArea = Literal[tuple(INJURY_AREAS)]  # type: ignore[valid-type]


class ExerciseSummary(BaseModel):
    id: str
    name: str
    category: str
    level: str
    equipment: str | None
    force: str | None
    mechanic: str | None
    primary_muscles: list[str]
    secondary_muscles: list[str]
    image_url: str | None
    # Active injuries this exercise works: as a main muscle (left out unless asked for), or as a helper muscle.
    avoid: list[str]
    caution: list[str]


class ExerciseDetail(ExerciseSummary):
    instructions: list[str]
    image_urls: list[str]
    # False when the user's gym list doesn't have this exercise's equipment.
    in_my_gym: bool


class ExerciseSearch(BaseModel):
    items: list[ExerciseSummary]
    # Matches after every filter, before paging.
    total: int
    # How many matches the gym and injury filters took out, so the app can say why the list is short.
    hidden_by_gym: int
    hidden_by_injuries: int


class GymEquipmentIn(Input):
    equipment: list[GymItem] = Field(max_length=len(GYM_EQUIPMENT))


class GymEquipmentOut(BaseModel):
    equipment: list[str]
    # Needs nothing, so always counts as available.
    always: list[str]


class InjuryCreate(Input):
    area: InjuryArea
    note: str | None = Field(default=None, max_length=500)
    active: bool = True
    started_on: date | None = None
    ended_on: date | None = None


class InjuryUpdate(Input):
    area: InjuryArea | None = None
    note: str | None = Field(default=None, max_length=500)
    active: bool | None = None
    started_on: date | None = None
    ended_on: date | None = None
