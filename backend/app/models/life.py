import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned


class Habit(Owned, Base):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint("char_length(name) <= 180", name="name_length"),
        CheckConstraint("frequency in ('daily', 'weekly')", name="frequency"),
        CheckConstraint("target_count > 0 and target_count <= 21", name="target_count"),
        UniqueConstraint("id", "user_id"),
        Index("habits_user_active_idx", "user_id", "archived_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    frequency: Mapped[str] = mapped_column(Text, nullable=False, server_default="daily")
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    color: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class HabitLog(Owned, Base):
    __tablename__ = "habit_logs"
    __table_args__ = (
        ForeignKeyConstraint(["habit_id", "user_id"], ["habits.id", "habits.user_id"], ondelete="CASCADE"),
        Index("habit_logs_user_logged_idx", "user_id", text("logged_at desc")),
        Index("habit_logs_habit_logged_idx", "habit_id", text("logged_at desc")),
    )

    habit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    note: Mapped[str | None] = mapped_column(Text)
