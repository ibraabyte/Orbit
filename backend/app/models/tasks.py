import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


class Task(Owned, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        CheckConstraint("status in ('open', 'done', 'archived')", name="status"),
        CheckConstraint("priority in ('low', 'normal', 'high')", name="priority"),
        CheckConstraint("recurrence is null or recurrence in ('daily', 'weekly', 'monthly')", name="recurrence"),
        # Lets child rows point at (id, user_id), so a row can only reference its owner's task.
        UniqueConstraint("id", "user_id"),
        Index("tasks_user_due_idx", "user_id", "due_at"),
        Index("tasks_user_created_idx", "user_id", text("created_at desc")),
        Index(
            "tasks_due_reminders_idx",
            "status",
            "reminder_at",
            postgresql_where=text("reminder_at is not null and reminder_sent_at is null"),
        ),
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    priority: Mapped[str] = mapped_column(Text, nullable=False, server_default="normal")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recurrence: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class Reminder(Owned, Base):
    __tablename__ = "reminders"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        CheckConstraint("status in ('scheduled', 'sent', 'cancelled')", name="status"),
        ForeignKeyConstraint(["task_id", "user_id"], ["tasks.id", "tasks.user_id"], ondelete="CASCADE"),
        Index("reminders_due_idx", "status", "remind_at"),
        Index("reminders_user_remind_idx", "user_id", "remind_at"),
    )

    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    remind_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="scheduled")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class FocusSession(Owned, Base):
    __tablename__ = "focus_sessions"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        CheckConstraint("duration_minutes >= 0 and duration_minutes <= 1440", name="duration_minutes"),
        CheckConstraint("status in ('planned', 'completed', 'cancelled')", name="status"),
        CheckConstraint("energy is null or (energy >= 1 and energy <= 5)", name="energy"),
        # Deleting the task keeps the session and clears only task_id.
        ForeignKeyConstraint(["task_id", "user_id"], ["tasks.id", "tasks.user_id"], ondelete="SET NULL (task_id)"),
        Index("focus_sessions_user_started_idx", "user_id", text("started_at desc")),
        Index("focus_sessions_user_status_idx", "user_id", "status", "started_at"),
        Index("focus_sessions_task_idx", "task_id", text("started_at desc")),
    )

    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="completed")
    energy: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
