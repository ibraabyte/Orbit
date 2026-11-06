import uuid

from pydantic import BaseModel
from sqlalchemy.orm import Session, object_session

from app.crud import get_owned, owned_crud_router
from app.deps import Db, UserId
from app.models import Reminder, Task, TaskList, TaskStep
from app.schemas.rows import row_schema
from app.schemas.tasks import (
    ReminderCreate,
    ReminderUpdate,
    TaskCreate,
    TaskListCreate,
    TaskListUpdate,
    TaskStepCreate,
    TaskStepUpdate,
    TaskUpdate,
)
from app.services.tasks import add_steps, complete_task, ensure_list, reminder_for, reschedule_reminder


def _created(db: Session, task: Task, list_name: str | None = None, steps: list[str] | None = None) -> None:
    if list_name:
        task.list_id = ensure_list(db, task.user_id, list_name).id
    if steps:
        add_steps(db, task, steps)
    # The app used to insert this row itself right after the task. Now one call does both.
    if reminder := reminder_for(task):
        db.add(reminder)


def _updated(task: Task, fields: set[str], list_name: str | None = None) -> None:
    db = object_session(task)
    assert db is not None
    if list_name:
        task.list_id = ensure_list(db, task.user_id, list_name).id
    if "reminder_at" in fields:
        reschedule_reminder(db, task)


router = owned_crud_router(
    Task,
    prefix="/tasks",
    create=TaskCreate,
    update=TaskUpdate,
    order_by=Task.created_at.desc(),
    after_create=_created,
    after_update=_updated,
    tag_target="task",
    extras=("list_name", "steps"),
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


lists_router = owned_crud_router(
    TaskList, prefix="/task-lists", create=TaskListCreate, update=TaskListUpdate, order_by=TaskList.position.asc()
)
# Each step must point at one of the user's own tasks; the (task_id, user_id) foreign key refuses anything else.
steps_router = owned_crud_router(
    TaskStep, prefix="/task-steps", create=TaskStepCreate, update=TaskStepUpdate, order_by=TaskStep.position.asc(), max_limit=1000
)
