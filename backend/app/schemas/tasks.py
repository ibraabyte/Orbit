import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

TaskStatus = Literal["open", "done", "archived"]
TaskPriority = Literal["low", "normal", "high"]
Recurrence = Literal["daily", "weekly", "monthly"]
ReminderStatus = Literal["scheduled", "sent", "cancelled"]
StepTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=220)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ListChoice(Input):
    # Either a list's id (the app) or its name (quick add, the assistant); a name that doesn't exist yet becomes a list.
    list_id: uuid.UUID | None = None
    list_name: str | None = Field(default=None, min_length=1, max_length=60)

    @model_validator(mode="after")
    def one_list(self):
        if self.list_id is not None and self.list_name is not None:
            raise ValueError("Send list_id or list_name, not both.")
        return self


class TaskCreate(ListChoice):
    title: str = Field(min_length=1, max_length=220)
    notes: str | None = None
    status: TaskStatus = "open"
    priority: TaskPriority = "normal"
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    recurrence: Recurrence | None = None
    # Tag names to attach in the same call; missing tags are created.
    tags: list[str] = Field(default_factory=list, max_length=20)
    # Checklist lines (subtasks) created with the task, in this order.
    steps: list[StepTitle] = Field(default_factory=list, max_length=30)


class TaskUpdate(ListChoice):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    notes: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: datetime | None = None
    reminder_at: datetime | None = None
    reminder_sent_at: datetime | None = None
    recurrence: Recurrence | None = None


class TaskListCreate(Input):
    name: str = Field(min_length=1, max_length=60)
    position: int = Field(default=0, ge=0, le=10_000)


class TaskListUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    position: int | None = Field(default=None, ge=0, le=10_000)


class TaskStepCreate(Input):
    task_id: uuid.UUID
    title: str = Field(min_length=1, max_length=220)
    done: bool = False
    position: int = Field(default=0, ge=0, le=10_000)


class TaskStepUpdate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    done: bool | None = None
    position: int | None = Field(default=None, ge=0, le=10_000)


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
