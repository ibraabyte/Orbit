import type { RecurrenceRule, Task, TaskList, TaskStep } from "@/lib/types";

// The Tasks section's plain logic: which day a task falls on, snoozing, reminder lead times, lists and checklists.
// Local time throughout, like the rest of the app (tests pin Asia/Riyadh).

const HOUR = 3_600_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());

export const DAY_GROUPS = ["overdue", "today", "tomorrow", "later", "someday"] as const;
export type DayGroup = (typeof DAY_GROUPS)[number];

/** Overdue (time passed), today, tomorrow, later, or someday (no date). */
export function dayGroup(task: Pick<Task, "due_at">, now = new Date()): DayGroup {
  if (!task.due_at) return "someday";
  const due = new Date(task.due_at);
  if (due.getTime() < now.getTime()) return "overdue";
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / (24 * HOUR));
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return "later";
}

const priorityRank = { high: 0, normal: 1, low: 2 } as const;

/** Earliest first; same time (or no date) puts high priority first, then the newest. */
export function compareTasks(a: Task, b: Task) {
  const due = (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
  if (due) return due;
  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  return priority || b.created_at.localeCompare(a.created_at);
}

/** Open tasks in day groups, empty groups left out. */
export function groupByDay(tasks: Task[], now = new Date()) {
  const groups = new Map<DayGroup, Task[]>(DAY_GROUPS.map((group) => [group, []]));
  for (const task of tasks) if (task.status === "open") groups.get(dayGroup(task, now))!.push(task);
  return DAY_GROUPS.map((group) => ({ group, tasks: groups.get(group)!.sort(compareTasks) })).filter((entry) => entry.tasks.length > 0);
}

/** "all", "none" (tasks in no list) or a list id. */
export type ListFilter = "all" | "none" | string;

export function inList(tasks: Task[], filter: ListFilter) {
  if (filter === "all") return tasks;
  if (filter === "none") return tasks.filter((task) => !task.list_id);
  return tasks.filter((task) => task.list_id === filter);
}

export const sortLists = (lists: TaskList[]) => [...lists].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

/** The next free position, so a new list goes to the end. */
export const nextListPosition = (lists: TaskList[]) => (lists.length ? Math.max(...lists.map((list) => list.position)) + 1 : 0);

/** True when another list already has this name (any case). */
export function listNameTaken(lists: TaskList[], name: string, exceptId?: string) {
  const wanted = name.trim().toLowerCase();
  return lists.some((list) => list.id !== exceptId && list.name.toLowerCase() === wanted);
}

/** Each task's checklist, in order. */
export function stepsByTask(steps: TaskStep[]) {
  const byTask = new Map<string, TaskStep[]>();
  for (const step of steps) byTask.set(step.task_id, [...(byTask.get(step.task_id) ?? []), step]);
  for (const list of byTask.values()) list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return byTask;
}

export const stepProgress = (steps: TaskStep[] | undefined) => ({ done: steps?.filter((step) => step.done).length ?? 0, total: steps?.length ?? 0 });

export const nextStepPosition = (steps: TaskStep[] | undefined) => (steps?.length ? Math.max(...steps.map((step) => step.position)) + 1 : 0);

// Snooze: in an hour, tonight at 8, tomorrow, or next week. A dated task keeps its time of day; one without lands at 9.
export const SNOOZES = ["hour", "tonight", "tomorrow", "nextWeek"] as const;
export type Snooze = (typeof SNOOZES)[number];

export function snoozeTarget(choice: Snooze, task: Pick<Task, "due_at">, now = new Date()): Date | null {
  const due = task.due_at ? new Date(task.due_at) : null;
  const at = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), due?.getHours() ?? 9, due?.getMinutes() ?? 0);
  if (choice === "hour") return new Date(Math.ceil((now.getTime() + HOUR) / 60_000) * 60_000);
  if (choice === "tonight") {
    const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0);
    // Too late for tonight: the option isn't offered.
    return tonight.getTime() - now.getTime() >= HOUR / 2 ? tonight : null;
  }
  // From the later of today and the task's own day, so "next week" on a task due Friday is the Friday after.
  const from = due && due.getTime() > now.getTime() ? due : now;
  return at(addDays(from, choice === "tomorrow" ? 1 : 7));
}

/** The due date moves; a reminder moves with it and keeps its lead time (15 minutes before stays 15 minutes before). */
export function snoozeChanges(task: Pick<Task, "due_at" | "reminder_at">, until: Date) {
  const changes: { due_at: string; reminder_at?: string } = { due_at: until.toISOString() };
  if (task.reminder_at) {
    const lead = task.due_at ? new Date(task.due_at).getTime() - new Date(task.reminder_at).getTime() : 0;
    changes.reminder_at = new Date(until.getTime() - Math.max(0, lead)).toISOString();
  }
  return changes;
}

// Reminder choices on the task screen, as minutes before the due time.
export const REMINDER_LEADS = ["none", "0", "15", "60", "1440"] as const;
export type ReminderLead = (typeof REMINDER_LEADS)[number] | "custom";

export function reminderLead(task: Pick<Task, "due_at" | "reminder_at">): ReminderLead {
  if (!task.reminder_at) return "none";
  if (!task.due_at) return "custom";
  const minutes = Math.round((new Date(task.due_at).getTime() - new Date(task.reminder_at).getTime()) / 60_000);
  const match = REMINDER_LEADS.find((lead) => lead !== "none" && Number(lead) === minutes);
  return match ?? "custom";
}

export function reminderAt(dueAt: string | null, lead: ReminderLead, current: string | null): string | null {
  if (lead === "custom") return current;
  if (lead === "none" || !dueAt) return null;
  return new Date(new Date(dueAt).getTime() - Number(lead) * 60_000).toISOString();
}

/** "9:30", "09:30", "21:05" → hour and minute; anything else → null. Accepts Arabic-Indic digits. */
export function parseClock(value: string) {
  const western = value.trim().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[٫:.]/, ":");
  const match = western.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** A local calendar day (YYYY-MM-DD) and a clock time as one instant. */
export function dayAt(day: string, clock: { hour: number; minute: number }) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, clock.hour, clock.minute);
}

/** Moves a task to another day, keeping its time of day (9 AM when it had none). */
export function onDay(task: Pick<Task, "due_at">, day: string) {
  const old = task.due_at ? new Date(task.due_at) : null;
  return dayAt(day, { hour: old?.getHours() ?? 9, minute: old?.getMinutes() ?? 0 });
}

export const repeatGlyph = "↻";
export const recurrences: readonly RecurrenceRule[] = ["daily", "weekly", "monthly"];
