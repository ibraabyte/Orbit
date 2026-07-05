import type { DashboardData } from "@/lib/types";
import { formatMacros } from "@/lib/food";
import { captureSearchFields } from "@/lib/library";
import { tagsForTarget, type TagTargetType } from "@/lib/tag-actions";

export const searchResultTypes = [
  "task",
  "reminder",
  "capture",
  "meal",
  "mealPlan",
  "grocery",
  "person",
  "workout",
  "sleep",
  "focus",
  "expense",
  "bill",
  "habit",
  "goal",
  "journal"
] as const;

export type SearchResultType = (typeof searchResultTypes)[number];
export type SearchTypeFilter = SearchResultType | "all";

export const searchResultLabels: Record<SearchResultType, string> = {
  task: "Tasks",
  reminder: "Reminders",
  capture: "Captures",
  meal: "Meals",
  mealPlan: "Meal plans",
  grocery: "Groceries",
  person: "People",
  workout: "Workouts",
  sleep: "Sleep",
  focus: "Focus",
  expense: "Expenses",
  bill: "Bills",
  habit: "Habits",
  goal: "Goals",
  journal: "Journal"
};

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  tags: string[];
};

export function buildSearchResults(data: DashboardData, query: string, typeFilter: SearchTypeFilter = "all") {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return allSearchResults(data)
    .filter((result) => typeFilter === "all" || result.type === typeFilter)
    .filter((result) =>
      [result.type, result.title, result.detail, ...result.tags].some((value) => value.toLowerCase().includes(normalized))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function allSearchResults(data: DashboardData): SearchResult[] {
  const tagNames = (targetType: TagTargetType, targetId: string) =>
    tagsForTarget(data.tags, data.taggings, targetType, targetId).map((tag) => tag.name);

  return [
    ...data.tasks.map((task) => ({
      id: `task-${task.id}`,
      type: "task" as const,
      title: task.title,
      detail: [task.notes, task.priority, task.status, task.recurrence].filter(Boolean).join(" · "),
      href: "/tasks",
      createdAt: task.updated_at,
      tags: tagNames("task", task.id)
    })),
    ...data.reminders.map((reminder) => ({
      id: `reminder-${reminder.id}`,
      type: "reminder" as const,
      title: reminder.title,
      detail: [reminder.body, reminder.status, reminder.remind_at].filter(Boolean).join(" · "),
      href: "/tasks",
      createdAt: reminder.created_at,
      tags: []
    })),
    ...data.captures.map((capture) => ({
      id: `capture-${capture.id}`,
      type: "capture" as const,
      title: capture.title,
      detail: captureSearchFields(capture, data.attachments)
        .slice(1)
        .filter(Boolean)
        .join(" · "),
      href: "/library",
      createdAt: capture.created_at,
      tags: tagNames("capture", capture.id)
    })),
    ...data.meals.map((meal) => ({
      id: `meal-${meal.id}`,
      type: "meal" as const,
      title: meal.name,
      detail: [`${meal.calories} calories`, formatMacros({ protein: meal.protein_g, carbs: meal.carbs_g, fat: meal.fat_g })].filter(Boolean).join(" · "),
      href: "/health",
      createdAt: meal.logged_at,
      tags: tagNames("meal", meal.id)
    })),
    ...data.mealPlans.map((plan) => ({
      id: `meal-plan-${plan.id}`,
      type: "mealPlan" as const,
      title: plan.name,
      detail: [plan.meal_type, `${plan.calories} planned calories`, formatMacros({ protein: plan.protein_g, carbs: plan.carbs_g, fat: plan.fat_g }), plan.status, plan.note].filter(Boolean).join(" · "),
      href: "/food",
      createdAt: `${plan.plan_date}T12:00:00`,
      tags: tagNames("meal_plan", plan.id)
    })),
    ...data.groceryItems.map((item) => ({
      id: `grocery-${item.id}`,
      type: "grocery" as const,
      title: item.name,
      detail: [item.quantity, item.category, item.status, item.due_at].filter(Boolean).join(" · "),
      href: "/food",
      createdAt: item.updated_at,
      tags: tagNames("grocery_item", item.id)
    })),
    ...data.people.map((person) => ({
      id: `person-${person.id}`,
      type: "person" as const,
      title: person.name,
      detail: [person.relationship, person.contact_method, person.birthday ? `birthday ${person.birthday}` : null, person.next_follow_up_at ? `follow-up ${person.next_follow_up_at}` : null, person.notes].filter(Boolean).join(" · "),
      href: "/people",
      createdAt: person.updated_at,
      tags: []
    })),
    ...data.workouts.map((workout) => ({
      id: `workout-${workout.id}`,
      type: "workout" as const,
      title: workout.type,
      detail: [workout.duration_minutes ? `${workout.duration_minutes} minutes` : null, workout.notes].filter(Boolean).join(" · "),
      href: "/health",
      createdAt: workout.logged_at,
      tags: tagNames("workout", workout.id)
    })),
    ...data.sleepLogs.map((log) => ({
      id: `sleep-${log.id}`,
      type: "sleep" as const,
      title: `Sleep ${log.sleep_date}`,
      detail: [`${log.duration_minutes} minutes`, log.quality ? `quality ${log.quality}/5` : null, log.note].filter(Boolean).join(" · "),
      href: "/health",
      createdAt: `${log.sleep_date}T12:00:00`,
      tags: tagNames("sleep", log.id)
    })),
    ...data.focusSessions.map((session) => ({
      id: `focus-${session.id}`,
      type: "focus" as const,
      title: session.title,
      detail: [`${session.duration_minutes} minutes`, session.status, session.energy ? `energy ${session.energy}/5` : null, session.note].filter(Boolean).join(" · "),
      href: "/focus",
      createdAt: session.started_at,
      tags: tagNames("focus_session", session.id)
    })),
    ...data.expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      type: "expense" as const,
      title: expense.merchant,
      detail: [expense.category, `${expense.amount} ${expense.currency}`, expense.note].filter(Boolean).join(" · "),
      href: "/finance",
      createdAt: expense.spent_at,
      tags: tagNames("expense", expense.id)
    })),
    ...data.bills.map((bill) => ({
      id: `bill-${bill.id}`,
      type: "bill" as const,
      title: bill.name,
      detail: [bill.category, `${bill.amount} ${bill.currency}`, bill.recurrence, bill.status, bill.note].filter(Boolean).join(" · "),
      href: "/finance",
      createdAt: bill.updated_at,
      tags: tagNames("bill", bill.id)
    })),
    ...data.habits.map((habit) => ({
      id: `habit-${habit.id}`,
      type: "habit" as const,
      title: habit.name,
      detail: `${habit.frequency} · target ${habit.target_count}`,
      href: "/habits",
      createdAt: habit.created_at,
      tags: []
    })),
    ...data.goals.map((goal) => ({
      id: `goal-${goal.id}`,
      type: "goal" as const,
      title: goal.title,
      detail: [goal.status, goal.target_at ? `target ${goal.target_at}` : null, goal.notes].filter(Boolean).join(" · "),
      href: "/goals",
      createdAt: goal.updated_at,
      tags: []
    })),
    ...data.journalEntries.map((entry) => ({
      id: `journal-${entry.id}`,
      type: "journal" as const,
      title: entry.title || entry.entry_date,
      detail: [entry.mood, entry.body].filter(Boolean).join(" · "),
      href: "/journal",
      createdAt: entry.updated_at,
      tags: []
    }))
  ];
}
