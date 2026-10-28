import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TaskStatus = Literal["open", "done", "archived"]
TaskPriority = Literal["low", "normal", "high"]
Recurrence = Literal["daily", "weekly", "monthly"]
ReminderStatus = Literal["scheduled", "sent", "cancelled"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TaskCreate(Input):
    title: str = Field(min_length=1, max_length=220)
    notes: str | None = None
    status: TaskStatus = "open"
    priority: TaskPriority = "normal"
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    recurrence: Recurrence | None = None


class TaskUpdate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    notes: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    reminder_sent_at: datetime | None = None
    recurrence: Recurrence | None = None


class ReminderCreate(Input):
    task_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=220)
    body: str | None = None
    remind_at: datetime
    status: ReminderStatus = "scheduled"


class ReminderUpdate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    body: str | None = None
    remind_at: datetime | None = None
    status: ReminderStatus | None = None
    sent_at: datetime | None = None
