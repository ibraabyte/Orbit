"""Server side of src/lib/task-completion.ts. It runs as one transaction, so a failure can't leave half a completion."""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Reminder, Tagging, Task, TaskList, TaskStep
from app.services.recurrence import next_recurring_task


def ensure_list(db: Session, user_id: uuid.UUID, name: str) -> TaskList:
    """The user's list with this name (any case), made at the end of their lists if there is none yet."""
    name = name.strip()
    found = db.scalar(select(TaskList).where(TaskList.user_id == user_id, func.lower(TaskList.name) == name.lower()))
    if found:
        return found
    last = db.scalar(select(func.max(TaskList.position)).where(TaskList.user_id == user_id))
    created = TaskList(user_id=user_id, name=name, position=0 if last is None else last + 1)
    db.add(created)
    db.flush()
    return created


def add_steps(db: Session, task: Task, titles: Iterable[str]) -> None:
    db.add_all(TaskStep(user_id=task.user_id, task_id=task.id, title=title, position=index) for index, title in enumerate(titles))


def cancel_reminders(db: Session, task: Task) -> None:
    db.execute(
        update(Reminder)
        .where(Reminder.task_id == task.id, Reminder.user_id == task.user_id, Reminder.status == "scheduled")
        .values(status="cancelled")
    )


def reschedule_reminder(db: Session, task: Task) -> None:
    """After reminder_at changed (snooze, edit): the old scheduled reminder is cancelled and a new one made, and the
    phone may notify again."""
    cancel_reminders(db, task)
    task.reminder_sent_at = None
    if task.status == "open" and (reminder := reminder_for(task)):
        db.add(reminder)


def reminder_for(task: Task) -> Reminder | None:
    if task.reminder_at is None:
        return None
    return Reminder(
        user_id=task.user_id, task_id=task.id, title=task.title, body=task.notes, remind_at=task.reminder_at, status="scheduled"
    )


@dataclass
class Completion:
    task: Task
    next_task: Task | None


def complete_task(db: Session, task: Task, completed_at: datetime | None = None) -> Completion:
    # A second tap on "Done" must not spawn a second copy of a repeating task.
    if task.status == "done":
        return Completion(task, None)

    completed_at = completed_at or datetime.now(UTC)
    task.status = "done"
    cancel_reminders(db, task)

    next_dates = next_recurring_task(task.due_at, task.reminder_at, task.recurrence, completed_at)
    next_task = None
    if next_dates:
        next_task = Task(
            user_id=task.user_id,
            title=task.title,
            notes=task.notes,
            status="open",
            priority=task.priority,
            due_at=next_dates.due_at,
            reminder_at=next_dates.reminder_at,
            recurrence=task.recurrence,
            list_id=task.list_id,
        )
        db.add(next_task)
        db.flush()
        if reminder := reminder_for(next_task):
            db.add(reminder)
        tag_ids = db.scalars(
            select(Tagging.tag_id).where(Tagging.user_id == task.user_id, Tagging.target_type == "task", Tagging.target_id == task.id)
        ).all()
        db.add_all(Tagging(user_id=task.user_id, tag_id=tag_id, target_type="task", target_id=next_task.id) for tag_id in tag_ids)
        # The checklist comes back too, all unticked.
        steps = db.scalars(
            select(TaskStep.title)
            .where(TaskStep.user_id == task.user_id, TaskStep.task_id == task.id)
            .order_by(TaskStep.position, TaskStep.created_at)
        ).all()
        add_steps(db, next_task, steps)

    db.commit()
    db.refresh(task)
    if next_task:
        db.refresh(next_task)
    return Completion(task, next_task)
