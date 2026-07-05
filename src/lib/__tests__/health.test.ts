import { describe, expect, it } from "vitest";
import { buildHealthSnapshot } from "@/lib/health";
import type { Meal, SleepLog, WeightLog, Workout } from "@/lib/types";

const now = new Date("2026-07-10T12:00:00.000Z");

function meal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "meal-1",
    user_id: "user-1",
    name: "Meal",
    calories: 500,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    logged_at: "2026-07-10T08:00:00.000Z",
    created_at: "2026-07-10T08:00:00.000Z",
    ...overrides
  };
}

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    type: "Run",
    duration_minutes: 45,
    calories: null,
    notes: null,
    logged_at: "2026-07-10T09:00:00.000Z",
    created_at: "2026-07-10T09:00:00.000Z",
    ...overrides
  };
}

function sleep(overrides: Partial<SleepLog> = {}): SleepLog {
  return {
    id: "sleep-1",
    user_id: "user-1",
    sleep_date: "2026-07-10",
    duration_minutes: 420,
    quality: 4,
    bedtime_at: null,
    woke_at: null,
    note: null,
    created_at: "2026-07-10T08:00:00.000Z",
    ...overrides
  };
}

function weight(overrides: Partial<WeightLog> = {}): WeightLog {
  return {
    id: "weight-1",
    user_id: "user-1",
    weight: 82,
    unit: "kg",
    logged_at: "2026-07-10T08:00:00.000Z",
    created_at: "2026-07-10T08:00:00.000Z",
    ...overrides
  };
}

describe("health snapshot", () => {
  it("summarizes calories, workouts, sleep, and weight", () => {
    const snapshot = buildHealthSnapshot(
      {
        meals: [
          meal({ calories: 700, protein_g: 45, carbs_g: 70, fat_g: 20 }),
          meal({ calories: 400, protein_g: 20, carbs_g: 40, fat_g: 10, logged_at: "2026-07-09T08:00:00.000Z" })
        ],
        workouts: [
          workout({ duration_minutes: 45 }),
          workout({ id: "workout-2", duration_minutes: 30, logged_at: "2026-07-04T09:00:00.000Z" }),
          workout({ id: "old", duration_minutes: 90, logged_at: "2026-07-01T09:00:00.000Z" })
        ],
        sleepLogs: [sleep(), sleep({ id: "sleep-2", sleep_date: "2026-07-09", duration_minutes: 360 })],
        weightLogs: [weight({ id: "latest", weight: 81.2 }), weight({ id: "previous", weight: 82 })]
      },
      { dailyCalorieTarget: 2200, dailyProteinTarget: 160, dailyCarbsTarget: 250, dailyFatTarget: 70, weeklyWorkoutTarget: 120, now }
    );

    expect(snapshot).toEqual({
      todayCalories: 700,
      calorieTarget: 2200,
      calorieDelta: -1500,
      todayMacros: {
        protein: 45,
        carbs: 70,
        fat: 20
      },
      macroTargets: {
        protein: 160,
        carbs: 250,
        fat: 70
      },
      workoutMinutes: 75,
      workoutTarget: 120,
      workoutRemaining: 45,
      sleepAverageMinutes: 390,
      sleepNights: 2,
      latestWeight: 81.2,
      weightUnit: "kg",
      weightDelta: -0.8
    });
  });

  it("handles missing targets and sparse logs", () => {
    expect(
      buildHealthSnapshot(
        {
          meals: [],
          workouts: [],
          sleepLogs: [],
          weightLogs: [weight({ weight: 180, unit: "lb" })]
        },
        { now }
      )
    ).toMatchObject({
      todayCalories: 0,
      calorieTarget: null,
      calorieDelta: null,
      todayMacros: {
        protein: 0,
        carbs: 0,
        fat: 0
      },
      macroTargets: {
        protein: null,
        carbs: null,
        fat: null
      },
      workoutMinutes: 0,
      workoutTarget: 150,
      workoutRemaining: 150,
      sleepAverageMinutes: 0,
      sleepNights: 0,
      latestWeight: 180,
      weightUnit: "lb",
      weightDelta: null
    });
  });
});
