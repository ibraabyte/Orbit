import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Reminder, Task } from "@/lib/types";

export type ReminderNotification = {
  id: string;
  kind: "reminder" | "task";
  userId: string;
  title: string;
  body: string;
  url: string;
  reminderId?: string;
  taskId?: string;
};

export const REMINDER_PUSH_TITLE_LIMIT = 120;
export const REMINDER_PUSH_BODY_LIMIT = 240;

export type ReminderPushPayload = {
  title: string;
  body: string;
  url: string;
};

export function buildDueReminderNotifications({
  reminders,
  tasks,
  now = new Date()
}: {
  reminders: Reminder[];
  tasks: Task[];
  now?: Date;
}): ReminderNotification[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const dueReminderRows = reminders
    .filter(
      (reminder) =>
        reminder.status === "scheduled" &&
        new Date(reminder.remind_at).getTime() <= now.getTime() &&
        linkedTaskReminderIsActive(reminder, tasksById)
    )
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());

  const coveredTaskIds = new Set(dueReminderRows.map((reminder) => reminder.task_id).filter(Boolean));
  const reminderNotifications = dueReminderRows.map((reminder) => ({
    id: `reminder-${reminder.id}`,
    kind: "reminder" as const,
    userId: reminder.user_id,
    title: reminder.title,
    body: reminder.body ?? "A reminder is due.",
    url: reminder.task_id ? "/tasks" : "/dashboard",
    reminderId: reminder.id,
    taskId: reminder.task_id ?? undefined
  }));

  const taskNotifications = tasks
    .filter(
      (task) =>
        task.status === "open" &&
        task.reminder_at &&
        !task.reminder_sent_at &&
        new Date(task.reminder_at).getTime() <= now.getTime() &&
        !coveredTaskIds.has(task.id)
    )
    .sort((a, b) => new Date(a.reminder_at as string).getTime() - new Date(b.reminder_at as string).getTime())
    .map((task) => ({
      id: `task-${task.id}`,
      kind: "task" as const,
      userId: task.user_id,
      title: task.title,
      body: task.notes ?? "A task reminder is due.",
      url: "/tasks",
      taskId: task.id
    }));

  return [...reminderNotifications, ...taskNotifications];
}

export function buildReminderPushPayload(notification: Pick<ReminderNotification, "title" | "body" | "url">): ReminderPushPayload {
  return {
    title: compactPushText(notification.title, "Orbit reminder", REMINDER_PUSH_TITLE_LIMIT),
    body: compactPushText(notification.body, "A reminder is due.", REMINDER_PUSH_BODY_LIMIT),
    url: safePushPath(notification.url)
  };
}

function linkedTaskReminderIsActive(reminder: Reminder, tasksById: Map<string, Task>) {
  if (!reminder.task_id) return true;
  const task = tasksById.get(reminder.task_id);
  return Boolean(task && task.status === "open" && !task.reminder_sent_at);
}

export function shouldMarkNotificationDelivered(successfulDeliveries: number) {
  return successfulDeliveries > 0;
}

export async function markReminderNotificationDelivered(
  supabase: SupabaseClient<Database>,
  notification: Pick<ReminderNotification, "reminderId" | "taskId" | "userId">,
  sentAt = new Date().toISOString()
) {
  if (notification.taskId) {
    const { error } = await supabase
      .from("tasks")
      .update({ reminder_sent_at: sentAt })
      .eq("id", notification.taskId)
      .eq("user_id", notification.userId);
    if (error) return { marked: false, error: error.message };
  }

  if (notification.reminderId) {
    const { error } = await supabase
      .from("reminders")
      .update({ status: "sent", sent_at: sentAt })
      .eq("id", notification.reminderId)
      .eq("user_id", notification.userId);
    if (error) return { marked: false, error: error.message };
  }

  return { marked: true, error: null };
}

function compactPushText(value: string, fallback: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim() || fallback;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function safePushPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
