"""Server side of src/lib/task-completion.ts. It runs as one transaction, so a failure can't leave half a completion."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Reminder, Tagging, Task
from app.services.recurrence import next_recurring_task


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
    db.execute(
        update(Reminder)
        .where(Reminder.task_id == task.id, Reminder.user_id == task.user_id, Reminder.status == "scheduled")
        .values(status="cancelled")
    )

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
        )
        db.add(next_task)
        db.flush()
        if reminder := reminder_for(next_task):
            db.add(reminder)
        tag_ids = db.scalars(
            select(Tagging.tag_id).where(Tagging.user_id == task.user_id, Tagging.target_type == "task", Tagging.target_id == task.id)
        ).all()
        db.add_all(Tagging(user_id=task.user_id, tag_id=tag_id, target_type="task", target_id=next_task.id) for tag_id in tag_ids)

    db.commit()
    db.refresh(task)
    if next_task:
        db.refresh(next_task)
    return Completion(task, next_task)
