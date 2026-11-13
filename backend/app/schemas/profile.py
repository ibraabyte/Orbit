from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.profile import DASHBOARD_MODULES, SECTIONS

DashboardModule = Literal[DASHBOARD_MODULES]  # type: ignore[valid-type]
SectionName = Literal[SECTIONS]  # type: ignore[valid-type]


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
    # Replaces the whole list; [] shows everything again.
    hidden_sections: list[SectionName] | None = Field(default=None, max_length=len(SECTIONS))

    @field_validator("hidden_sections")
    @classmethod
    def once_each(cls, value: list[str] | None) -> list[str] | None:
        # Each section once, in SECTIONS order, so the same choice is always stored the same way.
        return None if value is None else [name for name in SECTIONS if name in value]
