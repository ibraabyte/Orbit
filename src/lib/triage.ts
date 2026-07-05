import { dueReminders, dueTaskReminders, openTasks, overdueTasks } from "@/lib/dashboard";
import { focusSessionsInLastDays, overdueFocusSessions } from "@/lib/focus";
import { overdueMealPlans } from "@/lib/food";
import { goalProgress } from "@/lib/goals";
import { habitProgress } from "@/lib/habits";
import { overdueFollowUps } from "@/lib/people";
import { sleepLogsInLastDays } from "@/lib/sleep";
import type { DashboardData, Tagging } from "@/lib/types";

export type TriageKind = "task" | "reminder" | "capture" | "focus" | "food" | "people" | "health" | "finance" | "habit" | "goal" | "journal";
export type TriageTone = "danger" | "warning" | "neutral";

export type TriageItem = {
  id: string;
  kind: TriageKind;
  title: string;
  detail: string;
  href: string;
  tone: TriageTone;
  createdAt: string;
};

export type TriageAction =
  | { type: "complete-task"; label: "Complete"; targetId: string }
  | { type: "task-capture"; label: "Make task"; targetId: string }
  | { type: "remind-capture"; label: "Remind"; targetId: string }
  | { type: "ack-reminder"; label: "Done"; targetId: string }
  | { type: "snooze-reminder"; label: "+1h"; targetId: string }
  | { type: "ack-task-reminder"; label: "Done"; targetId: string }
  | { type: "snooze-task-reminder"; label: "+1h"; targetId: string }
  | { type: "cancel-focus"; label: "Cancel"; targetId: string }
  | { type: "skip-meal-plan"; label: "Skip"; targetId: string }
  | { type: "buy-grocery"; label: "Bought"; targetId: string }
  | { type: "contact-person"; label: "Contacted"; targetId: string }
  | { type: "pay-bill"; label: "Paid"; targetId: string }
  | { type: "check-in-habit"; label: "Check in"; targetId: string };

export type TriageSummary = {
  items: TriageItem[];
  counts: Record<TriageKind, number>;
  total: number;
};

export function triageActionsForItem(item: Pick<TriageItem, "id">): TriageAction[] {
  const taskId = targetIdFromPrefix(item.id, "task-overdue-") ?? targetIdFromPrefix(item.id, "task-unscheduled-") ?? targetIdFromPrefix(item.id, "task-untagged-");
  if (taskId) return [{ type: "complete-task", label: "Complete", targetId: taskId }];

  const captureId = targetIdFromPrefix(item.id, "capture-untagged-");
  if (captureId) {
    return [
      { type: "task-capture", label: "Make task", targetId: captureId },
      { type: "remind-capture", label: "Remind", targetId: captureId }
    ];
  }

  const reminderId = targetIdFromPrefix(item.id, "reminder-due-");
  if (reminderId) {
    return [
      { type: "ack-reminder", label: "Done", targetId: reminderId },
      { type: "snooze-reminder", label: "+1h", targetId: reminderId }
    ];
  }

  const taskReminderId = targetIdFromPrefix(item.id, "task-reminder-due-");
  if (taskReminderId) {
    return [
      { type: "ack-task-reminder", label: "Done", targetId: taskReminderId },
      { type: "snooze-task-reminder", label: "+1h", targetId: taskReminderId }
    ];
  }

  const focusId = targetIdFromPrefix(item.id, "focus-overdue-");
  if (focusId) return [{ type: "cancel-focus", label: "Cancel", targetId: focusId }];

  const mealPlanId = targetIdFromPrefix(item.id, "food-overdue-");
  if (mealPlanId) return [{ type: "skip-meal-plan", label: "Skip", targetId: mealPlanId }];

  const groceryId = targetIdFromPrefix(item.id, "grocery-due-");
  if (groceryId) return [{ type: "buy-grocery", label: "Bought", targetId: groceryId }];

  const personId = targetIdFromPrefix(item.id, "people-overdue-");
  if (personId) return [{ type: "contact-person", label: "Contacted", targetId: personId }];

  const billId = targetIdFromPrefix(item.id, "bill-overdue-");
  if (billId) return [{ type: "pay-bill", label: "Paid", targetId: billId }];

  const habitId = targetIdFromPrefix(item.id, "habit-behind-");
  if (habitId) return [{ type: "check-in-habit", label: "Check in", targetId: habitId }];

  return [];
}

export function buildTriageSummary(data: DashboardData, now = new Date()): TriageSummary {
  const items = [
    ...overdueTasks(data.tasks, now).map((task) => ({
      id: `task-overdue-${task.id}`,
      kind: "task" as const,
      title: task.title,
      detail: "Overdue task",
      href: "/tasks",
      tone: "danger" as const,
      createdAt: task.due_at ?? task.updated_at
    })),
    ...openTasks(data.tasks)
      .filter((task) => !task.due_at && !task.reminder_at)
      .map((task) => ({
        id: `task-unscheduled-${task.id}`,
        kind: "task" as const,
        title: task.title,
        detail: "No due date or reminder",
        href: "/tasks",
        tone: task.priority === "high" ? ("warning" as const) : ("neutral" as const),
        createdAt: task.updated_at
      })),
    ...openTasks(data.tasks)
      .filter((task) => !hasTag(data.taggings, "task", task.id))
      .map((task) => ({
        id: `task-untagged-${task.id}`,
        kind: "task" as const,
        title: task.title,
        detail: "No tags",
        href: "/tasks",
        tone: "neutral" as const,
        createdAt: task.updated_at
      })),
    ...dueReminders(data.reminders, now, data.tasks).map((reminder) => ({
      id: `reminder-due-${reminder.id}`,
      kind: "reminder" as const,
      title: reminder.title,
      detail: "Reminder is due",
      href: "/tasks",
      tone: "warning" as const,
      createdAt: reminder.remind_at
    })),
    ...dueTaskReminders(data.tasks, data.reminders, now).map((task) => ({
      id: `task-reminder-due-${task.id}`,
      kind: "reminder" as const,
      title: task.title,
      detail: "Task reminder is due",
      href: "/tasks",
      tone: "warning" as const,
      createdAt: task.reminder_at ?? task.updated_at
    })),
    ...overdueFocusSessions(data.focusSessions, now).map((session) => ({
      id: `focus-overdue-${session.id}`,
      kind: "focus" as const,
      title: session.title,
      detail: "Planned focus block is overdue",
      href: "/focus",
      tone: "warning" as const,
      createdAt: session.started_at
    })),
    ...data.focusSessions
      .filter((session) => session.status !== "cancelled" && !hasTag(data.taggings, "focus_session", session.id))
      .map((session) => ({
        id: `focus-untagged-${session.id}`,
        kind: "focus" as const,
        title: session.title,
        detail: "Focus session without tags",
        href: "/focus",
        tone: "neutral" as const,
        createdAt: session.started_at
      })),
    ...(openTasks(data.tasks).some((task) => task.priority === "high") && !focusSessionsInLastDays(data.focusSessions, 3, now).length
      ? [
          {
            id: "focus-missing",
            kind: "focus" as const,
            title: "Block focus time",
            detail: "High-priority tasks need a recent or planned focus block",
            href: "/focus",
            tone: "warning" as const,
            createdAt: now.toISOString()
          }
        ]
      : []),
    ...overdueMealPlans(data.mealPlans, now).map((plan) => ({
      id: `food-overdue-${plan.id}`,
      kind: "food" as const,
      title: plan.name,
      detail: "Planned meal is still open",
      href: "/food",
      tone: "warning" as const,
      createdAt: `${plan.plan_date}T12:00:00`
    })),
    ...data.groceryItems
      .filter((item) => item.status === "needed" && item.due_at && !isAfterToday(item.due_at, now))
      .map((item) => ({
        id: `grocery-due-${item.id}`,
        kind: "food" as const,
        title: item.name,
        detail: "Grocery item is due",
        href: "/food",
        tone: "warning" as const,
        createdAt: `${item.due_at}T10:00:00`
      })),
    ...overdueFollowUps(data.people, now).map((person) => ({
      id: `people-overdue-${person.id}`,
      kind: "people" as const,
      title: person.name,
      detail: "Follow-up is overdue",
      href: "/people",
      tone: "warning" as const,
      createdAt: `${person.next_follow_up_at}T10:00:00`
    })),
    ...data.captures
      .filter((capture) => !hasTag(data.taggings, "capture", capture.id))
      .map((capture) => ({
        id: `capture-untagged-${capture.id}`,
        kind: "capture" as const,
        title: capture.title,
        detail: `${capture.type} without tags`,
        href: "/library",
        tone: "neutral" as const,
        createdAt: capture.created_at
      })),
    ...data.sleepLogs
      .filter((log) => !hasTag(data.taggings, "sleep", log.id))
      .map((log) => ({
        id: `sleep-untagged-${log.id}`,
        kind: "health" as const,
        title: `Sleep ${log.sleep_date}`,
        detail: "Sleep log without tags",
        href: "/health",
        tone: "neutral" as const,
        createdAt: `${log.sleep_date}T12:00:00`
      })),
    ...(sleepLogsInLastDays(data.sleepLogs, 3, now).length
      ? []
      : [
          {
            id: "sleep-missing",
            kind: "health" as const,
            title: "Log recovery",
            detail: "No sleep log in the last 3 days",
            href: "/health",
            tone: "neutral" as const,
            createdAt: now.toISOString()
          }
        ]),
    ...data.bills
      .filter((bill) => bill.status === "active" && isBeforeToday(bill.due_at, now))
      .map((bill) => ({
        id: `bill-overdue-${bill.id}`,
        kind: "finance" as const,
        title: bill.name,
        detail: "Bill is overdue",
        href: "/finance",
        tone: "danger" as const,
        createdAt: `${bill.due_at}T12:00:00`
      })),
    ...data.expenses
      .filter((expense) => expense.category === "other" && !hasTag(data.taggings, "expense", expense.id))
      .map((expense) => ({
        id: `expense-unclassified-${expense.id}`,
        kind: "finance" as const,
        title: expense.merchant,
        detail: "Uncategorized expense without tags",
        href: "/finance",
        tone: "neutral" as const,
        createdAt: expense.spent_at
      })),
    ...data.bills
      .filter((bill) => bill.status === "active" && bill.category === "other" && !hasTag(data.taggings, "bill", bill.id))
      .map((bill) => ({
        id: `bill-unclassified-${bill.id}`,
        kind: "finance" as const,
        title: bill.name,
        detail: "Uncategorized bill without tags",
        href: "/finance",
        tone: "neutral" as const,
        createdAt: bill.updated_at
      })),
    ...data.habits
      .filter((habit) => !habitProgress(habit, data.habitLogs, now).done)
      .map((habit) => {
        const progress = habitProgress(habit, data.habitLogs, now);
        return {
          id: `habit-behind-${habit.id}`,
          kind: "habit" as const,
          title: habit.name,
          detail: `${progress.completed}/${progress.target} this ${habit.frequency === "daily" ? "day" : "week"}`,
          href: "/habits",
          tone: "warning" as const,
          createdAt: habit.created_at
        };
      }),
    ...data.goals
      .filter((goal) => goal.status === "active")
      .filter((goal) => goalProgress(goal, data.goalMilestones).percent < 100 && isOlderThan(goal.updated_at, 14, now))
      .map((goal) => ({
        id: `goal-stale-${goal.id}`,
        kind: "goal" as const,
        title: goal.title,
        detail: "No recent update",
        href: "/goals",
        tone: "warning" as const,
        createdAt: goal.updated_at
      })),
    ...(hasRecentJournal(data, now)
      ? []
      : [
          {
            id: "journal-missing",
            kind: "journal" as const,
            title: "Add a reflection",
            detail: "No journal entry in the last 3 days",
            href: "/journal",
            tone: "neutral" as const,
            createdAt: now.toISOString()
          }
        ])
  ]
    .sort((a, b) => toneWeight(b.tone) - toneWeight(a.tone) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 80);

  return {
    items,
    counts: items.reduce(
      (counts, item) => {
        counts[item.kind] += 1;
        return counts;
      },
      { task: 0, reminder: 0, capture: 0, focus: 0, food: 0, people: 0, health: 0, finance: 0, habit: 0, goal: 0, journal: 0 } satisfies Record<TriageKind, number>
    ),
    total: items.length
  };
}

function hasTag(taggings: Tagging[], targetType: Tagging["target_type"], targetId: string) {
  return taggings.some((tagging) => tagging.target_type === targetType && tagging.target_id === targetId);
}

function targetIdFromPrefix(id: string, prefix: string) {
  return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}

function hasRecentJournal(data: DashboardData, now: Date) {
  return data.journalEntries.some((entry) => !isOlderThan(`${entry.entry_date}T12:00:00`, 3, now));
}

function isOlderThan(value: string, days: number, now: Date) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return new Date(value).getTime() < cutoff.getTime();
}

function isBeforeToday(value: string, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(`${value.slice(0, 10)}T12:00:00`).getTime() < today.getTime();
}

function isAfterToday(value: string, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(`${value.slice(0, 10)}T12:00:00`).getTime() > today.getTime();
}

function toneWeight(tone: TriageTone) {
  if (tone === "danger") return 3;
  if (tone === "warning") return 2;
  return 1;
}
