from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.profile import DASHBOARD_MODULES

DashboardModule = Literal[DASHBOARD_MODULES]  # type: ignore[valid-type]


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    weight_unit: Literal["kg", "lb"] | None = None
    daily_calorie_target: int | None = Field(default=None, ge=0, le=20000)
    daily_protein_target: int | None = Field(default=None, ge=0, le=1000)
    daily_carbs_target: int | None = Field(default=None, ge=0, le=2000)
    daily_fat_target: int | None = Field(default=None, ge=0, le=1000)
    weekly_workout_minutes_target: int | None = Field(default=None, ge=0, le=10080)
    dashboard_modules: list[DashboardModule] | None = Field(default=None, min_length=1)
