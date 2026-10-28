import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at

DASHBOARD_MODULES = (
    "attention",
    "tasks",
    "library",
    "reminders",
    "upcoming",
    "health",
    "review",
    "insights",
    "goals",
    "food",
    "finance",
    "people",
    "focus",
    "habits",
    "journal",
)

_modules_sql = "array[" + ", ".join(f"'{m}'" for m in DASHBOARD_MODULES) + "]::text[]"


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("weight_unit in ('kg', 'lb')", name="weight_unit"),
        CheckConstraint(
            "daily_calorie_target is null or (daily_calorie_target >= 0 and daily_calorie_target <= 20000)", name="daily_calorie_target"
        ),
        CheckConstraint(
            "daily_protein_target is null or (daily_protein_target >= 0 and daily_protein_target <= 1000)", name="daily_protein_target"
        ),
        CheckConstraint(
            "daily_carbs_target is null or (daily_carbs_target >= 0 and daily_carbs_target <= 2000)", name="daily_carbs_target"
        ),
        CheckConstraint("daily_fat_target is null or (daily_fat_target >= 0 and daily_fat_target <= 1000)", name="daily_fat_target"),
        CheckConstraint(
            "weekly_workout_minutes_target >= 0 and weekly_workout_minutes_target <= 10080", name="weekly_workout_minutes_target"
        ),
        CheckConstraint(f"cardinality(dashboard_modules) > 0 and dashboard_modules <@ {_modules_sql}", name="dashboard_modules_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, server_default="UTC")
    weight_unit: Mapped[str] = mapped_column(Text, nullable=False, server_default="kg")
    daily_calorie_target: Mapped[int | None] = mapped_column(Integer)
    daily_protein_target: Mapped[int | None] = mapped_column(Integer)
    daily_carbs_target: Mapped[int | None] = mapped_column(Integer)
    daily_fat_target: Mapped[int | None] = mapped_column(Integer)
    weekly_workout_minutes_target: Mapped[int] = mapped_column(Integer, nullable=False, server_default="150")
    dashboard_modules: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default=text(_modules_sql))
    created_at: Mapped[datetime] = created_at()
