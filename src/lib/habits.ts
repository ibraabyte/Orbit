import { isToday } from "@/lib/dates";
import type { Habit, HabitLog } from "@/lib/types";

export function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function habitLogsInCurrentPeriod(habit: Habit, logs: HabitLog[], now = new Date()) {
  return logs.filter((log) => {
    if (log.habit_id !== habit.id) return false;
    const loggedAt = new Date(log.logged_at);
    if (habit.frequency === "daily") return isToday(log.logged_at, now);
    return loggedAt.getTime() >= startOfWeek(now).getTime();
  });
}

export function habitProgress(habit: Habit, logs: HabitLog[], now = new Date()) {
  const completed = habitLogsInCurrentPeriod(habit, logs, now).length;
  return {
    completed,
    target: habit.target_count,
    done: completed >= habit.target_count
  };
}

export function habitMomentum(habit: Habit, logs: HabitLog[], now = new Date()) {
  const periodCounts = new Map<string, number>();
  const relevantLogs = logs.filter((log) => log.habit_id === habit.id);

  for (const log of relevantLogs) {
    const key = periodKey(new Date(log.logged_at), habit.frequency);
    periodCounts.set(key, (periodCounts.get(key) ?? 0) + 1);
  }

  let cursor = periodStart(now, habit.frequency);
  let currentStreak = 0;

  while ((periodCounts.get(periodKey(cursor, habit.frequency)) ?? 0) >= habit.target_count) {
    currentStreak += 1;
    cursor = previousPeriod(cursor, habit.frequency);
  }

  return {
    currentStreak,
    unit: habit.frequency === "daily" ? ("day" as const) : ("week" as const),
    checkedInCurrentPeriod: habitProgress(habit, logs, now).done,
    totalCheckIns: relevantLogs.length,
    lastLoggedAt: relevantLogs.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())[0]?.logged_at ?? null
  };
}

export function completedHabitsToday(habits: Habit[], logs: HabitLog[], now = new Date()) {
  return habits.filter((habit) => habitProgress(habit, logs, now).done).length;
}

function periodStart(date: Date, frequency: Habit["frequency"]) {
  if (frequency === "weekly") return startOfWeek(date);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function previousPeriod(date: Date, frequency: Habit["frequency"]) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - (frequency === "weekly" ? 7 : 1));
  return previous;
}

function periodKey(date: Date, frequency: Habit["frequency"]) {
  const start = periodStart(date, frequency);
  const offset = start.getTimezoneOffset();
  return new Date(start.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
