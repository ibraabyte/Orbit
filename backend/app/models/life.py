import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


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


class Goal(Owned, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        CheckConstraint("status in ('active', 'completed', 'archived')", name="status"),
        UniqueConstraint("id", "user_id"),
        Index("goals_user_status_idx", "user_id", "status", text("updated_at desc")),
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    target_at: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = updated_at()


class GoalMilestone(Owned, Base):
    __tablename__ = "goal_milestones"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        ForeignKeyConstraint(["goal_id", "user_id"], ["goals.id", "goals.user_id"], ondelete="CASCADE"),
        Index("goal_milestones_goal_idx", "goal_id", "completed_at"),
        Index("goal_milestones_user_created_idx", "user_id", text("created_at desc")),
    )

    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JournalEntry(Owned, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        CheckConstraint("mood in ('great', 'good', 'neutral', 'low', 'bad')", name="mood"),
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        UniqueConstraint("user_id", "entry_date"),
        Index("journal_entries_user_date_idx", "user_id", text("entry_date desc")),
    )

    mood: Mapped[str] = mapped_column(Text, nullable=False, server_default="neutral")
    title: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    updated_at: Mapped[datetime] = updated_at()


class Person(Owned, Base):
    __tablename__ = "people"
    __table_args__ = (
        Index("people_user_name_idx", "user_id", "name"),
        Index("people_user_followup_idx", "user_id", "next_follow_up_at"),
        Index("people_user_birthday_idx", "user_id", "birthday"),
        Index("people_user_favorite_idx", "user_id", "favorite"),
        Index("people_user_updated_idx", "user_id", text("updated_at desc")),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    relationship: Mapped[str | None] = mapped_column(Text)
    contact_method: Mapped[str | None] = mapped_column(Text)
    birthday: Mapped[date | None] = mapped_column(Date)
    last_contacted_at: Mapped[date | None] = mapped_column(Date)
    next_follow_up_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_at: Mapped[datetime] = updated_at()
