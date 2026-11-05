import { habitLogsInCurrentPeriod } from "@/lib/habits";
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

// The local calendar day of a stored UTC timestamp (slicing the ISO string gives the UTC day).
export function localDayOf(timestamp: string) {
  return localDateKey(new Date(timestamp));
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
    value: data.meals.filter((meal) => localDayOf(meal.logged_at) === day.date).reduce((sum, meal) => sum + meal.calories, 0)
  }));
}

export function workoutMinutesByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.workouts
      .filter((workout) => localDayOf(workout.logged_at) === day.date)
      .reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0)
  }));
}

export function habitCheckInsByDay(data: DashboardData, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.habitLogs.filter((log) => localDayOf(log.logged_at) === day.date).length
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
