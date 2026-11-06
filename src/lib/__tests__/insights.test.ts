import { describe, expect, it } from "vitest";
import {
  caloriesByDay,
  habitCompletionRate,
  localDateKey,
  weightTrend,
  workoutMinutesByDay
} from "@/lib/insights";
import type { DashboardData, Habit, HabitLog } from "@/lib/types";

const now = new Date("2026-07-07T12:00:00.000Z");
const baseData: DashboardData = {
  profile: null,
  tasks: [],
  taskLists: [],
  taskSteps: [],
  reminders: [],
  captures: [],
  attachments: [],
  tags: [],
  taggings: [],
  meals: [
    {
      id: "meal-1",
      user_id: "user-1",
      name: "Breakfast",
      calories: 500,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      logged_at: "2026-07-07T08:00:00.000Z",
      created_at: "2026-07-07T08:00:00.000Z"
    }
  ],
  mealPlans: [],
  groceryItems: [],
  weightLogs: [
    {
      id: "weight-2",
      user_id: "user-1",
      weight: 81.2,
      unit: "kg",
      logged_at: "2026-07-07T08:00:00.000Z",
      created_at: "2026-07-07T08:00:00.000Z"
    },
    {
      id: "weight-1",
      user_id: "user-1",
      weight: 82,
      unit: "kg",
      logged_at: "2026-07-01T08:00:00.000Z",
      created_at: "2026-07-01T08:00:00.000Z"
    }
  ],
  workouts: [
    {
      id: "workout-1",
      user_id: "user-1",
      type: "Run",
      duration_minutes: 30,
      calories: null,
      notes: null,
      logged_at: "2026-07-07T09:00:00.000Z",
      created_at: "2026-07-07T09:00:00.000Z"
    }
  ],
  expenses: [],
  bills: [],
  sleepLogs: [
    {
      id: "sleep-1",
      user_id: "user-1",
      sleep_date: "2026-07-07",
      duration_minutes: 420,
      quality: 4,
      bedtime_at: null,
      woke_at: null,
      note: null,
      created_at: "2026-07-07T08:00:00.000Z"
    }
  ],
  habits: [
    {
      id: "habit-1",
      user_id: "user-1",
      name: "Walk",
      frequency: "daily",
      target_count: 1,
      color: null,
      archived_at: null,
      created_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  habitLogs: [
    {
      id: "habit-log-1",
      user_id: "user-1",
      habit_id: "habit-1",
      logged_at: "2026-07-07T10:00:00.000Z",
      note: null,
      created_at: "2026-07-07T10:00:00.000Z"
    }
  ],
  budgets: [],
  cards: [],
  moneyAccounts: [],
  investments: [],
  obligations: [],
  obligationInstallments: [],
};

describe("insights", () => {
  it("creates local date keys", () => {
    expect(localDateKey(now)).toMatch(/2026-07-07|2026-07-08/);
  });

  it("builds daily health series", () => {
    expect(caloriesByDay(baseData, 1, now)).toEqual([{ date: localDateKey(now), label: "Tue", value: 500 }]);
    expect(workoutMinutesByDay(baseData, 1, now)[0].value).toBe(30);
  });

  it("calculates habit and weight summaries", () => {
    expect(habitCompletionRate(baseData.habits as Habit[], baseData.habitLogs as HabitLog[], now)).toBe(100);
    expect(weightTrend(baseData)).toEqual({ latest: 81.2, unit: "kg", delta: -0.8 });
  });
});
