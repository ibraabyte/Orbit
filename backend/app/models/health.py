import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKeyConstraint, Index, Integer, Numeric, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


class Meal(Owned, Base):
    __tablename__ = "meals"
    __table_args__ = (
        CheckConstraint("char_length(name) <= 220", name="name_length"),
        CheckConstraint("calories >= 0", name="calories"),
        Index("meals_user_logged_idx", "user_id", text("logged_at desc")),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    calories: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric)
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric)
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WeightLog(Owned, Base):
    __tablename__ = "weight_logs"
    __table_args__ = (
        CheckConstraint("weight > 0", name="weight"),
        CheckConstraint("unit in ('kg', 'lb')", name="unit"),
        Index("weight_logs_user_logged_idx", "user_id", text("logged_at desc")),
    )

    weight: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    unit: Mapped[str] = mapped_column(Text, nullable=False, server_default="kg")
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Workout(Owned, Base):
    __tablename__ = "workouts"
    __table_args__ = (
        CheckConstraint("char_length(type) <= 160", name="type_length"),
        CheckConstraint("duration_minutes >= 0", name="duration_minutes"),
        CheckConstraint("calories >= 0", name="calories"),
        Index("workouts_user_logged_idx", "user_id", text("logged_at desc")),
    )

    type: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    calories: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SleepLog(Owned, Base):
    __tablename__ = "sleep_logs"
    __table_args__ = (
        CheckConstraint("duration_minutes >= 0 and duration_minutes <= 1440", name="duration_minutes"),
        CheckConstraint("quality is null or (quality >= 1 and quality <= 5)", name="quality"),
        Index("sleep_logs_user_date_idx", "user_id", text("sleep_date desc")),
    )

    sleep_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    quality: Mapped[int | None] = mapped_column(Integer)
    bedtime_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    woke_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)


class MealPlan(Owned, Base):
    __tablename__ = "meal_plans"
    __table_args__ = (
        CheckConstraint("meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')", name="meal_type"),
        CheckConstraint("calories >= 0", name="calories"),
        CheckConstraint("status in ('planned', 'prepped', 'eaten', 'skipped')", name="status"),
        UniqueConstraint("id", "user_id"),
        Index("meal_plans_user_date_idx", "user_id", text("plan_date desc")),
        Index("meal_plans_user_status_idx", "user_id", "status", "plan_date"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    plan_date: Mapped[date] = mapped_column(Date, nullable=False)
    meal_type: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    calories: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric)
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric)
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="planned")
    updated_at: Mapped[datetime] = updated_at()


class GroceryItem(Owned, Base):
    __tablename__ = "grocery_items"
    __table_args__ = (
        CheckConstraint("category in ('produce', 'protein', 'dairy', 'pantry', 'frozen', 'household', 'other')", name="category"),
        CheckConstraint("status in ('needed', 'bought', 'skipped')", name="status"),
        ForeignKeyConstraint(["meal_plan_id", "user_id"], ["meal_plans.id", "meal_plans.user_id"], ondelete="SET NULL (meal_plan_id)"),
        Index("grocery_items_user_status_idx", "user_id", "status", text("created_at desc")),
        Index("grocery_items_user_created_idx", "user_id", text("created_at desc")),
        Index("grocery_items_meal_plan_idx", "meal_plan_id"),
    )

    meal_plan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="needed")
    due_at: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = updated_at()
