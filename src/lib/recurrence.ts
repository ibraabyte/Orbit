import type { RecurrenceRule, Task } from "@/lib/types";

const dayMs = 24 * 60 * 60 * 1000;

export function addRecurrenceDate(value: string | null, recurrence: RecurrenceRule | null, intervals = 1) {
  if (!value || !recurrence) return null;
  let date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const intervalCount = Math.max(1, Math.floor(intervals));
  for (let index = 0; index < intervalCount; index += 1) {
    date = addSingleRecurrenceDate(date, recurrence);
  }

  return date.toISOString();
}

export function nextRecurrenceDate(value: string | null, recurrence: RecurrenceRule | null, after = new Date()) {
  if (!value || !recurrence) return null;
  let date = new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(after.getTime())) return null;

  let intervals = 0;
  do {
    intervals += 1;
    date = addSingleRecurrenceDate(date, recurrence);
  } while (date <= after);

  return { value: date.toISOString(), intervals };
}

function addSingleRecurrenceDate(date: Date, recurrence: RecurrenceRule) {
  if (recurrence === "daily") {
    return new Date(date.getTime() + dayMs);
  }

  if (recurrence === "weekly") {
    return new Date(date.getTime() + 7 * dayMs);
  }

  const day = date.getUTCDate();
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export function nextRecurringTask(task: Task, after = new Date()) {
  if (!task.recurrence) return null;
  const nextDue = nextRecurrenceDate(task.due_at, task.recurrence, after);
  const reminderIntervals = nextDue?.intervals ?? nextRecurrenceDate(task.reminder_at, task.recurrence, after)?.intervals ?? null;
  const nextReminder =
    task.reminder_at && reminderIntervals ? addRecurrenceDate(task.reminder_at, task.recurrence, reminderIntervals) : null;

  if (!nextDue && !nextReminder) return null;

  return {
    user_id: task.user_id,
    title: task.title,
    notes: task.notes,
    status: "open" as const,
    priority: task.priority,
    due_at: nextDue?.value ?? null,
    reminder_at: nextReminder,
    reminder_sent_at: null,
    recurrence: task.recurrence
  };
}
