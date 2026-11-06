import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKeyConstraint, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


class TaskList(Owned, Base):
    """A named group of tasks, like Home or Work. Deleting one keeps its tasks; they just lose the list."""

    __tablename__ = "task_lists"
    __table_args__ = (
        CheckConstraint("char_length(name) between 1 and 60", name="name_length"),
        CheckConstraint("position >= 0", name="position"),
        UniqueConstraint("id", "user_id"),
        # One "Work" per user, whatever the case.
        Index("task_lists_user_lower_name_idx", "user_id", text("lower(name)"), unique=True),
        Index("task_lists_user_position_idx", "user_id", "position"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = updated_at()


class Task(Owned, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("char_length(title) <= 220", name="title_length"),
        CheckConstraint("status in ('open', 'done', 'archived')", name="status"),
        CheckConstraint("priority in ('low', 'normal', 'high')", name="priority"),
        CheckConstraint("recurrence is null or recurrence in ('daily', 'weekly', 'monthly')", name="recurrence"),
        # Lets child rows point at (id, user_id), so a row can only reference its owner's task.
        UniqueConstraint("id", "user_id"),
        # Deleting the list keeps the task and clears only list_id.
        ForeignKeyConstraint(["list_id", "user_id"], ["task_lists.id", "task_lists.user_id"], ondelete="SET NULL (list_id)"),
        Index("tasks_list_idx", "list_id"),
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
    list_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[datetime] = updated_at()


class TaskStep(Owned, Base):
    """One line of a task's checklist (a subtask). Goes with its task when the task is deleted."""

    __tablename__ = "task_steps"
    __table_args__ = (
        CheckConstraint("char_length(title) between 1 and 220", name="title_length"),
        CheckConstraint("position >= 0", name="position"),
        ForeignKeyConstraint(["task_id", "user_id"], ["tasks.id", "tasks.user_id"], ondelete="CASCADE"),
        Index("task_steps_task_idx", "task_id", "position"),
        Index("task_steps_user_idx", "user_id"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
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
