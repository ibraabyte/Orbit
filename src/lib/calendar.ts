import { localDateKey } from "@/lib/insights";
import { upcomingBirthdays } from "@/lib/people";
import type { DashboardData } from "@/lib/types";

export type CalendarEventKind = "task" | "reminder" | "meal" | "mealPlan" | "grocery" | "person" | "workout" | "weight" | "sleep" | "focus" | "expense" | "bill" | "journal" | "goal";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  detail: string;
  at: string;
  href: string;
};

export type CalendarDay = {
  date: string;
  label: string;
  events: CalendarEvent[];
};

export function calendarRange(days: number, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() + index);
    return {
      date: localDateKey(date),
      label: new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric"
      }).format(date)
    };
  });
}

export function buildCalendarDays(data: DashboardData, days = 14, now = new Date()): CalendarDay[] {
  const range = calendarRange(days, now);
  const byDate = new Map(range.map((day) => [day.date, { ...day, events: [] as CalendarEvent[] }]));

  for (const event of buildCalendarEvents(data, now)) {
    const day = byDate.get(event.at.slice(0, 10));
    if (day) day.events.push(event);
  }

  return [...byDate.values()].map((day) => ({
    ...day,
    events: day.events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }));
}

export function buildCalendarEvents(data: DashboardData, now = new Date()): CalendarEvent[] {
  return [
    ...data.tasks.flatMap((task) => {
      const events: CalendarEvent[] = [];
      if (task.due_at) {
        events.push({
          id: `task-due-${task.id}`,
          kind: "task",
          title: task.title,
          detail: `Due · ${task.priority}`,
          at: task.due_at,
          href: "/tasks"
        });
      }
      if (task.reminder_at) {
        events.push({
          id: `task-reminder-${task.id}`,
          kind: "reminder",
          title: task.title,
          detail: "Task reminder",
          at: task.reminder_at,
          href: "/tasks"
        });
      }
      return events;
    }),
    ...data.reminders.map((reminder) => ({
      id: `reminder-${reminder.id}`,
      kind: "reminder" as const,
      title: reminder.title,
      detail: reminder.status,
      at: reminder.remind_at,
      href: "/tasks"
    })),
    ...data.meals.map((meal) => ({
      id: `meal-${meal.id}`,
      kind: "meal" as const,
      title: meal.name,
      detail: `${meal.calories} calories`,
      at: meal.logged_at,
      href: "/health"
    })),
    ...data.mealPlans
      .filter((plan) => plan.status !== "skipped")
      .map((plan) => ({
        id: `meal-plan-${plan.id}`,
        kind: "mealPlan" as const,
        title: plan.name,
        detail: `${plan.meal_type} · ${plan.calories} planned calories · ${plan.status}`,
        at: `${plan.plan_date}T12:00:00`,
        href: "/food"
      })),
    ...data.groceryItems
      .filter((item) => item.status === "needed" && item.due_at)
      .map((item) => ({
        id: `grocery-${item.id}`,
        kind: "grocery" as const,
        title: item.name,
        detail: `${item.quantity ?? "quantity open"} · ${item.category}`,
        at: `${item.due_at}T10:00:00`,
        href: "/food"
      })),
    ...data.people
      .filter((person) => person.next_follow_up_at)
      .map((person) => ({
        id: `person-follow-up-${person.id}`,
        kind: "person" as const,
        title: person.name,
        detail: "Follow-up",
        at: `${person.next_follow_up_at}T10:00:00`,
        href: "/people"
      })),
    ...upcomingBirthdays(data.people, 370, now).map((event) => ({
      id: `person-birthday-${event.person.id}`,
      kind: "person" as const,
      title: event.person.name,
      detail: event.age === null ? "Birthday" : `Birthday · ${event.age}`,
      at: `${event.date}T09:00:00`,
      href: "/people"
    })),
    ...data.workouts.map((workout) => ({
      id: `workout-${workout.id}`,
      kind: "workout" as const,
      title: workout.type,
      detail: `${workout.duration_minutes ?? 0} minutes`,
      at: workout.logged_at,
      href: "/health"
    })),
    ...data.weightLogs.map((weight) => ({
      id: `weight-${weight.id}`,
      kind: "weight" as const,
      title: `${weight.weight} ${weight.unit}`,
      detail: "Weight log",
      at: weight.logged_at,
      href: "/health"
    })),
    ...data.sleepLogs.map((log) => ({
      id: `sleep-${log.id}`,
      kind: "sleep" as const,
      title: "Sleep",
      detail: `${log.duration_minutes} minutes · quality ${log.quality ?? "-"}/5`,
      at: `${log.sleep_date}T09:00:00`,
      href: "/health"
    })),
    ...data.focusSessions
      .filter((session) => session.status !== "cancelled")
      .map((session) => ({
        id: `focus-${session.id}`,
        kind: "focus" as const,
        title: session.title,
        detail: `${session.duration_minutes} minutes · ${session.status}`,
        at: session.started_at,
        href: "/focus"
      })),
    ...data.expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      kind: "expense" as const,
      title: expense.merchant,
      detail: `${expense.amount} ${expense.currency} · ${expense.category}`,
      at: expense.spent_at,
      href: "/finance"
    })),
    ...data.bills
      .filter((bill) => bill.status === "active")
      .map((bill) => ({
        id: `bill-${bill.id}`,
        kind: "bill" as const,
        title: bill.name,
        detail: `${bill.amount} ${bill.currency} · ${bill.recurrence}${bill.autopay ? " · autopay" : ""}`,
        at: `${bill.due_at}T12:00:00`,
        href: "/finance"
      })),
    ...data.journalEntries.map((entry) => ({
      id: `journal-${entry.id}`,
      kind: "journal" as const,
      title: entry.title || "Journal entry",
      detail: `Mood: ${entry.mood}`,
      at: `${entry.entry_date}T12:00:00`,
      href: "/journal"
    })),
    ...data.goals
      .filter((goal) => goal.target_at)
      .map((goal) => ({
        id: `goal-${goal.id}`,
        kind: "goal" as const,
        title: goal.title,
        detail: "Goal target",
        at: `${goal.target_at}T12:00:00`,
        href: "/goals"
      }))
  ];
}

export function calendarEventCounts(days: CalendarDay[]) {
  return days.reduce<Record<CalendarEventKind, number>>(
    (counts, day) => {
      for (const event of day.events) {
        counts[event.kind] += 1;
      }
      return counts;
    },
    {
      task: 0,
      reminder: 0,
      meal: 0,
      mealPlan: 0,
      grocery: 0,
      person: 0,
      workout: 0,
      weight: 0,
      sleep: 0,
      focus: 0,
      expense: 0,
      bill: 0,
      journal: 0,
      goal: 0
    }
  );
}
