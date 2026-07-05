import type { DashboardWidgetId } from "@/lib/types";

export type DashboardWidgetDefinition = {
  id: DashboardWidgetId;
  label: string;
  detail: string;
};

export const dashboardWidgetDefinitions: DashboardWidgetDefinition[] = [
  { id: "attention", label: "Attention", detail: "Tasks due today and overdue work." },
  { id: "tasks", label: "Task manager", detail: "Create and manage tasks from Today." },
  { id: "library", label: "Library capture", detail: "Save links, notes, and screenshots." },
  { id: "reminders", label: "Reminder queue", detail: "Due reminders and snooze controls." },
  { id: "upcoming", label: "Upcoming", detail: "Next dated calendar items." },
  { id: "health", label: "Health today", detail: "Calories, workout, and sleep summary." },
  { id: "review", label: "Weekly review", detail: "Seven-day task, health, food, and money rollup." },
  { id: "insights", label: "Insights", detail: "Trend snapshots for health, money, goals, and habits." },
  { id: "goals", label: "Goals", detail: "Active goals and milestones." },
  { id: "food", label: "Food", detail: "Meal plan and grocery queue." },
  { id: "finance", label: "Finance", detail: "Expenses, bills, and subscriptions." },
  { id: "people", label: "People", detail: "Follow-ups and birthdays." },
  { id: "focus", label: "Focus", detail: "Focus sessions tied to tasks." },
  { id: "habits", label: "Habits", detail: "Routine check-ins." },
  { id: "journal", label: "Journal", detail: "Mood and daily reflection." }
];

export const defaultDashboardWidgets = dashboardWidgetDefinitions.map((definition) => definition.id);

export function normalizeDashboardWidgets(value: unknown): DashboardWidgetId[] {
  if (!Array.isArray(value)) return defaultDashboardWidgets;

  const requested = new Set(value.filter(isDashboardWidgetId));
  const normalized = dashboardWidgetDefinitions.map((definition) => definition.id).filter((id) => requested.has(id));

  return normalized.length ? normalized : defaultDashboardWidgets;
}

export function dashboardWidgetSet(value: unknown) {
  return new Set(normalizeDashboardWidgets(value));
}

export function toggleDashboardWidget(current: DashboardWidgetId[], id: DashboardWidgetId) {
  if (current.includes(id)) {
    return current.length > 1 ? current.filter((item) => item !== id) : current;
  }

  return normalizeDashboardWidgets([...current, id]);
}

function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && dashboardWidgetDefinitions.some((definition) => definition.id === value);
}
