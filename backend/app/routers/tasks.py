import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.crud import get_owned, owned_crud_router
from app.deps import Db, UserId
from app.models import Reminder, Task
from app.schemas.rows import row_schema
from app.schemas.tasks import ReminderCreate, ReminderUpdate, TaskCreate, TaskUpdate
from app.services.tasks import complete_task, reminder_for


def _schedule_reminder(db: Session, task: Task) -> None:
    # The app used to insert this row itself right after the task. Now one call does both.
    if reminder := reminder_for(task):
        db.add(reminder)


router = owned_crud_router(
    Task,
    prefix="/tasks",
    create=TaskCreate,
    update=TaskUpdate,
    order_by=Task.created_at.desc(),
    after_create=_schedule_reminder,
    tag_target="task",
)

TaskRow = row_schema(Task)


class CompletionOut(BaseModel):
    task: TaskRow  # type: ignore[valid-type]
    next_task: TaskRow | None  # type: ignore[valid-type]


@router.post("/{task_id}/complete", response_model=CompletionOut)
def complete(task_id: uuid.UUID, user_id: UserId, db: Db):
    """Marks the task done, cancels its scheduled reminders, and for a repeating task creates the next one
    (with its reminder and the same tags)."""
    result = complete_task(db, get_owned(db, Task, task_id, user_id))
    return CompletionOut(task=result.task, next_task=result.next_task)


reminders_router = owned_crud_router(
    Reminder, prefix="/reminders", create=ReminderCreate, update=ReminderUpdate, order_by=Reminder.remind_at.asc()
)
