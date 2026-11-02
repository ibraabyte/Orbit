"""Input and output shapes for food tracking: saved foods, search results, logging and the plate photo draft."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.tasks import Input

MealType = Literal["breakfast", "lunch", "dinner", "snack", "other"]
ExternalSource = Literal["off", "usda"]

Grams = Field(default=None, gt=0, le=100000)
Nutrient = Field(default=None, ge=0, le=10000)


class FoodCreate(Input):
    """The user's own food, like a home kabsa: numbers are for one serving."""

    name: str = Field(min_length=1, max_length=220)
    brand: str | None = Field(default=None, max_length=220)
    barcode: str | None = Field(default=None, max_length=32)
    serving_label: str = Field(default="1 serving", min_length=1, max_length=80)
    serving_grams: float | None = Grams
    calories: float = Field(ge=0, le=20000)
    protein_g: float | None = Nutrient
    carbs_g: float | None = Nutrient
    fat_g: float | None = Nutrient


class FoodUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=220)
    brand: str | None = Field(default=None, max_length=220)
    barcode: str | None = Field(default=None, max_length=32)
    serving_label: str | None = Field(default=None, min_length=1, max_length=80)
    serving_grams: float | None = Grams
    calories: float | None = Field(default=None, ge=0, le=20000)
    protein_g: float | None = Nutrient
    carbs_g: float | None = Nutrient
    fat_g: float | None = Nutrient


class Candidate(BaseModel):
    """A food found by search or barcode. food_id is set when the user already saved it."""

    source: Literal["custom", "off", "usda", "ai"]
    source_id: str | None = None
    food_id: uuid.UUID | None = None
    name: str
    brand: str | None = None
    barcode: str | None = None
    serving_label: str
    serving_grams: float | None = None
    calories: float
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None


class SearchOut(BaseModel):
    results: list[Candidate]
    # Sources that were skipped or failed, in words for the app.
    notes: list[str]


class RememberIn(Input):
    """Save a search or barcode result as the user's food, so picking it again is instant and works offline."""

    source: ExternalSource
    source_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=220)
    brand: str | None = Field(default=None, max_length=220)
    barcode: str | None = Field(default=None, max_length=32)
    serving_label: str = Field(min_length=1, max_length=80)
    serving_grams: float | None = Grams
    calories: float = Field(ge=0, le=20000)
    protein_g: float | None = Nutrient
    carbs_g: float | None = Nutrient
    fat_g: float | None = Nutrient


class LogIn(Input):
    servings: float = Field(default=1, gt=0, le=50)
    meal_type: MealType | None = None
    logged_at: datetime


class Totals(BaseModel):
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float


class Targets(BaseModel):
    calories: int | None
    protein_g: int | None
    carbs_g: int | None
    fat_g: int | None


class PhotoIn(Input):
    # The photo, base64. The app shrinks it first; about 5 MB is the most Claude takes.
    image: str = Field(min_length=100, max_length=7_000_000)
    media_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"
    # Optional hint from the user, like "chicken kabsa, half plate of rice".
    note: str | None = Field(default=None, max_length=300)


class PlateItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Short English name of one food on the plate, e.g. 'Chicken kabsa rice' or 'Grilled chicken thigh'.")
    portion: str = Field(description="The visible amount in everyday words, e.g. '1 cup', '2 pieces', 'half plate'.")
    grams: float | None = Field(description="Estimated weight in grams of the visible portion, or null if it can't be judged.")
    calories: float = Field(description="Estimated kcal for the visible portion.")
    protein_g: float | None = Field(description="Estimated grams of protein for the visible portion.")
    carbs_g: float | None = Field(description="Estimated grams of carbohydrate for the visible portion.")
    fat_g: float | None = Field(description="Estimated grams of fat for the visible portion.")
    confidence: Literal["low", "medium", "high"] = Field(description="How sure the estimate is.")


class PlateEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PlateItem] = Field(description="Each separate food visible. Empty if the photo shows no food.")
    note: str = Field(description="One or two short English sentences: what you assumed, or why there are no items.")


class PhotoOut(PlateEstimate):
    model: str
