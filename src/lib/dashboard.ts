import type { DashboardData, Expense, Meal, Reminder, SleepLog, Task, Workout } from "@/lib/types";
import { isPastDue, isToday } from "@/lib/dates";
import { completedHabitsToday } from "@/lib/habits";
import { activeGoals, completedGoals } from "@/lib/goals";
import { averageMood, journalEntriesInLastDays, todayEntry } from "@/lib/journal";
import { averageSleepMinutes, sleepLogsInLastDays } from "@/lib/sleep";
import { focusSessionsInLastDays, completedFocusMinutes, todaysFocusMinutes } from "@/lib/focus";
import { financeSummary } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { peopleSummary } from "@/lib/people";

export type DailyBriefTone = "default" | "danger" | "warning" | "success";

export type DailyBriefItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  label: string;
  tone: DailyBriefTone;
  priority: number;
};

export function openTasks(tasks: Task[]) {
  return tasks.filter((task) => task.status === "open");
}

export function todaysTasks(tasks: Task[], now = new Date()) {
  return openTasks(tasks).filter((task) => isToday(task.due_at, now) || isToday(task.reminder_at, now));
}

export function overdueTasks(tasks: Task[], now = new Date()) {
  return openTasks(tasks).filter((task) => isPastDue(task.due_at, now) && !isToday(task.due_at, now));
}

export function todaysCalories(meals: Meal[], now = new Date()) {
  return meals.filter((meal) => isToday(meal.logged_at, now)).reduce((sum, meal) => sum + meal.calories, 0);
}

export function todaysWorkoutMinutes(workouts: Workout[], now = new Date()) {
  return workouts
    .filter((workout) => isToday(workout.logged_at, now))
    .reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0);
}

export function todaysSpending(expenses: Expense[], now = new Date()) {
  return expenses.filter((expense) => isToday(expense.spent_at, now)).reduce((sum, expense) => sum + Number(expense.amount), 0);
}

export function todaysSleepMinutes(sleepLogs: SleepLog[], now = new Date()) {
  const today = localDate(now);
  return sleepLogs.filter((log) => log.sleep_date === today).reduce((sum, log) => sum + log.duration_minutes, 0);
}

export function scheduledReminders(reminders: Reminder[], tasks?: Task[]) {
  const tasksById = tasks ? new Map(tasks.map((task) => [task.id, task])) : null;

  return reminders
    .filter(
      (reminder) =>
        reminder.status === "scheduled" &&
        linkedTaskReminderIsActive(reminder, tasksById)
    )
    .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
}

export function dueReminders(reminders: Reminder[], now = new Date(), tasks?: Task[]) {
  return scheduledReminders(reminders, tasks).filter((reminder) => new Date(reminder.remind_at).getTime() <= now.getTime());
}

export function dueTaskReminders(tasks: Task[], reminders: Reminder[] = [], now = new Date()) {
  const coveredTaskIds = new Set(dueReminders(reminders, now, tasks).map((reminder) => reminder.task_id).filter(Boolean));

  return openTasks(tasks)
    .filter(
      (task) =>
        task.reminder_at &&
        !task.reminder_sent_at &&
        new Date(task.reminder_at).getTime() <= now.getTime() &&
        !coveredTaskIds.has(task.id)
    )
    .sort((a, b) => new Date(a.reminder_at as string).getTime() - new Date(b.reminder_at as string).getTime());
}

export function summarizeDashboard(data: DashboardData, now = new Date()) {
  return {
    openTaskCount: openTasks(data.tasks).length,
    todayTaskCount: todaysTasks(data.tasks, now).length,
    overdueTaskCount: overdueTasks(data.tasks, now).length,
    dueReminderCount: dueReminders(data.reminders, now, data.tasks).length + dueTaskReminders(data.tasks, data.reminders, now).length,
    todayCalories: todaysCalories(data.meals, now),
    todayWorkoutMinutes: todaysWorkoutMinutes(data.workouts, now),
    todaySpending: todaysSpending(data.expenses, now),
    todaySleepMinutes: todaysSleepMinutes(data.sleepLogs, now),
    todayFocusMinutes: todaysFocusMinutes(data.focusSessions, now),
    latestWeight: data.weightLogs[0]?.weight ?? null,
    recentCaptureCount: data.captures.length,
    completedHabitCount: completedHabitsToday(data.habits, data.habitLogs, now),
    activeHabitCount: data.habits.length,
    activeGoalCount: activeGoals(data.goals).length,
    completedGoalCount: completedGoals(data.goals).length,
    journaledToday: Boolean(todayEntry(data.journalEntries, now)),
    sevenDayMood: averageMood(journalEntriesInLastDays(data.journalEntries, 7, now))
  };
}

export function buildDailyBrief(data: DashboardData, now = new Date(), limit = 5): DailyBriefItem[] {
  const summary = summarizeDashboard(data, now);
  const week = weeklySummary(data, now);
  const finance = financeSummary(data, now);
  const food = foodSummary(data, now);
  const people = peopleSummary(data, now);
  const activeGoalRows = activeGoals(data.goals);
  const dueReminderCount = summary.dueReminderCount;
  const habitRemaining = Math.max(0, summary.activeHabitCount - summary.completedHabitCount);
  const workoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const workoutRemaining = Math.max(0, workoutTarget - week.workoutMinutes);
  const dueGoals = activeGoalRows.filter((goal) => goal.target_at && isDateWithinDays(goal.target_at, 7, now));
  const recentCaptures = data.captures.filter((capture) => isDateWithinDays(capture.created_at, 1, now)).length;

  const items: DailyBriefItem[] = [];

  if (dueReminderCount) {
    items.push({
      id: "due-reminders",
      title: "Clear due reminders",
      detail: `${dueReminderCount} reminder${dueReminderCount === 1 ? "" : "s"} waiting now.`,
      href: "/dashboard",
      label: "reminders",
      tone: "warning",
      priority: 100
    });
  }

  if (summary.overdueTaskCount) {
    items.push({
      id: "overdue-tasks",
      title: "Resolve overdue tasks",
      detail: `${summary.overdueTaskCount} task${summary.overdueTaskCount === 1 ? "" : "s"} slipped before today.`,
      href: "/inbox",
      label: "tasks",
      tone: "danger",
      priority: 96
    });
  }

  if (finance.overdueBills.length) {
    items.push({
      id: "overdue-bills",
      title: "Handle overdue bills",
      detail: `${finance.overdueBills.length} bill${finance.overdueBills.length === 1 ? "" : "s"} past due.`,
      href: "/finance",
      label: "money",
      tone: "danger",
      priority: 94
    });
  }

  if (people.overdueFollowUps.length) {
    items.push({
      id: "overdue-followups",
      title: "Catch up with people",
      detail: `${people.overdueFollowUps.length} follow-up${people.overdueFollowUps.length === 1 ? "" : "s"} overdue.`,
      href: "/people",
      label: "people",
      tone: "warning",
      priority: 90
    });
  }

  if (food.overdueMealPlans.length) {
    items.push({
      id: "overdue-meal-plans",
      title: "Resolve old meal plans",
      detail: `${food.overdueMealPlans.length} planned meal${food.overdueMealPlans.length === 1 ? "" : "s"} still open.`,
      href: "/food",
      label: "food",
      tone: "warning",
      priority: 84
    });
  }

  if (food.dueGroceries.length) {
    items.push({
      id: "due-groceries",
      title: "Review grocery queue",
      detail: `${food.dueGroceries.length} grocery item${food.dueGroceries.length === 1 ? "" : "s"} needed soon.`,
      href: "/food",
      label: "groceries",
      tone: "default",
      priority: 78
    });
  }

  if (summary.todayTaskCount) {
    items.push({
      id: "today-tasks",
      title: "Pick today's task order",
      detail: `${summary.todayTaskCount} task${summary.todayTaskCount === 1 ? "" : "s"} due or reminded today.`,
      href: "/tasks",
      label: "today",
      tone: "default",
      priority: 72
    });
  }

  if (habitRemaining) {
    items.push({
      id: "habits",
      title: "Protect today's habits",
      detail: `${habitRemaining} habit${habitRemaining === 1 ? "" : "s"} still below target.`,
      href: "/habits",
      label: "habits",
      tone: "default",
      priority: 66
    });
  }

  if (!food.todayPlannedMeals && summary.todayCalories === 0) {
    items.push({
      id: "food-plan",
      title: "Plan or log food",
      detail: "No meals planned or calories logged today.",
      href: "/food",
      label: "food",
      tone: "default",
      priority: 60
    });
  }

  if (workoutRemaining > 0) {
    items.push({
      id: "workout-target",
      title: "Move toward workout target",
      detail: `${workoutRemaining} minute${workoutRemaining === 1 ? "" : "s"} left this week.`,
      href: "/health",
      label: "health",
      tone: "default",
      priority: 55
    });
  }

  if (summary.todaySleepMinutes === 0) {
    items.push({
      id: "sleep-log",
      title: "Log sleep recovery",
      detail: "No sleep duration is logged for today.",
      href: "/health",
      label: "sleep",
      tone: "default",
      priority: 52
    });
  }

  if (!summary.journaledToday) {
    items.push({
      id: "journal",
      title: "Close the day with a note",
      detail: "Today does not have a journal entry yet.",
      href: "/journal",
      label: "review",
      tone: "default",
      priority: 48
    });
  }

  if (dueGoals.length) {
    items.push({
      id: "goal-deadlines",
      title: "Check goal deadlines",
      detail: `${dueGoals.length} active goal${dueGoals.length === 1 ? "" : "s"} due within 7 days.`,
      href: "/goals",
      label: "goals",
      tone: "warning",
      priority: 44
    });
  }

  if (!recentCaptures) {
    items.push({
      id: "capture",
      title: "Keep useful material easy to find",
      detail: "No links, notes, or screenshots captured today.",
      href: "/library",
      label: "library",
      tone: "default",
      priority: 20
    });
  }

  return items
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
    .slice(0, Math.max(0, limit));
}

function linkedTaskReminderIsActive(reminder: Reminder, tasksById: Map<string, Task> | null) {
  if (!reminder.task_id || !tasksById) return true;
  const task = tasksById.get(reminder.task_id);
  return Boolean(task && task.status === "open" && !task.reminder_sent_at);
}

export function weeklySummary(data: DashboardData, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const inWindow = (value: string) => new Date(value).getTime() >= start.getTime() && new Date(value).getTime() <= now.getTime();
  const meals = data.meals.filter((meal) => inWindow(meal.logged_at));
  const calories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const expenses = data.expenses.filter((expense) => inWindow(expense.spent_at));
  const sleepLogs = sleepLogsInLastDays(data.sleepLogs, 7, now);
  const focusSessions = focusSessionsInLastDays(data.focusSessions, 7, now);

  return {
    completedTasks: data.tasks.filter((task) => task.status === "done" && inWindow(task.updated_at)).length,
    workoutMinutes: data.workouts.filter((workout) => inWindow(workout.logged_at)).reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0),
    averageCalories: meals.length ? Math.round(calories / 7) : 0,
    capturesSaved: data.captures.filter((capture) => inWindow(capture.created_at)).length,
    spending: expenses.reduce((sum, expense) => sum + Number(expense.amount), 0),
    expensesLogged: expenses.length,
    sleepAverageMinutes: averageSleepMinutes(sleepLogs),
    sleepNights: sleepLogs.length,
    focusMinutes: completedFocusMinutes(focusSessions),
    focusSessions: focusSessions.filter((session) => session.status === "completed").length,
    habitCheckIns: data.habitLogs.filter((log) => inWindow(log.logged_at)).length,
    journalEntries: data.journalEntries.filter((entry) => inWindow(`${entry.entry_date}T12:00:00`)).length
  };
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function isDateWithinDays(value: string, days: number, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const date = new Date(value);
  return date >= start && date <= end;
}
