import { describe, expect, it } from "vitest";
import { completedHabitsToday, habitMomentum, habitProgress, startOfWeek } from "@/lib/habits";
import type { Habit, HabitLog } from "@/lib/types";

const now = new Date("2026-07-01T12:00:00.000Z");
const daily: Habit = {
  id: "habit-daily",
  user_id: "user-1",
  name: "Walk",
  frequency: "daily",
  target_count: 1,
  color: null,
  archived_at: null,
  created_at: now.toISOString()
};
const weekly: Habit = {
  ...daily,
  id: "habit-weekly",
  name: "Meal prep",
  frequency: "weekly",
  target_count: 2
};

function log(habit_id: string, logged_at: string): HabitLog {
  return {
    id: `${habit_id}-${logged_at}`,
    user_id: "user-1",
    habit_id,
    logged_at,
    note: null,
    created_at: logged_at
  };
}

describe("habits", () => {
  it("finds the Monday start of the current week", () => {
    const start = startOfWeek(now);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(29);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it("tracks daily and weekly habit progress", () => {
    expect(habitProgress(daily, [log("habit-daily", "2026-07-01T08:00:00.000Z")], now)).toMatchObject({
      completed: 1,
      target: 1,
      done: true
    });

    expect(
      habitProgress(
        weekly,
        [log("habit-weekly", "2026-06-30T08:00:00.000Z"), log("habit-weekly", "2026-07-01T08:00:00.000Z")],
        now
      )
    ).toMatchObject({ completed: 2, target: 2, done: true });
  });

  it("summarizes completed habits", () => {
    expect(completedHabitsToday([daily, weekly], [log("habit-daily", "2026-07-01T08:00:00.000Z")], now)).toBe(1);
  });

  it("calculates daily and weekly current streaks", () => {
    expect(
      habitMomentum(
        daily,
        [
          log("habit-daily", "2026-07-01T08:00:00.000Z"),
          log("habit-daily", "2026-06-30T08:00:00.000Z"),
          log("habit-daily", "2026-06-29T08:00:00.000Z"),
          log("habit-daily", "2026-06-27T08:00:00.000Z")
        ],
        now
      )
    ).toMatchObject({ currentStreak: 3, unit: "day", checkedInCurrentPeriod: true, totalCheckIns: 4 });

    expect(
      habitMomentum(
        weekly,
        [
          log("habit-weekly", "2026-07-01T08:00:00.000Z"),
          log("habit-weekly", "2026-06-30T08:00:00.000Z"),
          log("habit-weekly", "2026-06-24T08:00:00.000Z"),
          log("habit-weekly", "2026-06-23T08:00:00.000Z")
        ],
        now
      )
    ).toMatchObject({ currentStreak: 2, unit: "week", checkedInCurrentPeriod: true, totalCheckIns: 4 });
  });

  it("resets streaks when the current period target is not complete", () => {
    expect(habitMomentum(daily, [log("habit-daily", "2026-06-30T08:00:00.000Z")], now)).toMatchObject({
      currentStreak: 0,
      checkedInCurrentPeriod: false
    });
  });
});
