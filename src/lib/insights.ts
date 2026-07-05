import { activeGoals, goalProgress } from "@/lib/goals";
import { habitLogsInCurrentPeriod } from "@/lib/habits";
import { averageMood, journalEntriesInLastDays, moodScore } from "@/lib/journal";
import { sleepSummary } from "@/lib/sleep";
import { focusSummary } from "@/lib/focus";
import type { DashboardData, Habit, HabitLog } from "@/lib/types";

export type DailyMetric = {
  date: string;
  label: string;
  value: number;
};

export function localDateKey(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function lastDays(days: number, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (days - index - 1));
    const key = localDateKey(date);
    return {
      date: key,
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)
    };
  });
}

export function caloriesByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.meals.filter((meal) => meal.logged_at.slice(0, 10) === day.date).reduce((sum, meal) => sum + meal.calories, 0)
  }));
}

export function workoutMinutesByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.workouts
      .filter((workout) => workout.logged_at.slice(0, 10) === day.date)
      .reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0)
  }));
}

export function journalMoodByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => {
    const entry = data.journalEntries.find((journal) => journal.entry_date === day.date);
    return {
      ...day,
      value: entry ? moodScore(entry.mood) : 0
    };
  });
}

export function habitCheckInsByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.habitLogs.filter((log) => log.logged_at.slice(0, 10) === day.date).length
  }));
}

export function weightTrend(data: DashboardData) {
  const [latest, previous] = data.weightLogs;
  return {
    latest: latest?.weight ?? null,
    unit: latest?.unit ?? null,
    delta: latest && previous ? Number((latest.weight - previous.weight).toFixed(1)) : null
  };
}

export function habitCompletionRate(habits: Habit[], logs: HabitLog[], now = new Date()) {
  if (!habits.length) return 0;
  const completed = habits.filter((habit) => habitLogsInCurrentPeriod(habit, logs, now).length >= habit.target_count).length;
  return Math.round((completed / habits.length) * 100);
}

export function goalProgressAverage(data: DashboardData) {
  const goals = activeGoals(data.goals);
  if (!goals.length) return 0;
  return Math.round(goals.reduce((sum, goal) => sum + goalProgress(goal, data.goalMilestones).percent, 0) / goals.length);
}

export function insightSummary(data: DashboardData, now = new Date()) {
  const calories = caloriesByDay(data, 7, now);
  const workouts = workoutMinutesByDay(data, 7, now);
  const trend = weightTrend(data);
  const sleep = sleepSummary(data, now);
  const focus = focusSummary(data, now);

  return {
    averageCalories: Math.round(calories.reduce((sum, day) => sum + day.value, 0) / 7),
    workoutMinutes: workouts.reduce((sum, day) => sum + day.value, 0),
    habitCompletionRate: habitCompletionRate(data.habits, data.habitLogs, now),
    goalProgressAverage: goalProgressAverage(data),
    sevenDayMood: averageMood(journalEntriesInLastDays(data.journalEntries, 7, now)),
    weight: trend,
    sleep,
    focus
  };
}
