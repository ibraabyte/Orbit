import { describe, expect, it } from "vitest";
import {
  caloriesByDay,
  habitCompletionRate,
  insightSummary,
  journalMoodByDay,
  localDateKey,
  weightTrend,
  workoutMinutesByDay
} from "@/lib/insights";
import type { DashboardData, Habit, HabitLog } from "@/lib/types";

const now = new Date("2026-07-07T12:00:00.000Z");
const baseData: DashboardData = {
  profile: null,
  tasks: [],
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
  people: [],
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
  focusSessions: [
    {
      id: "focus-1",
      user_id: "user-1",
      task_id: null,
      title: "Deep work",
      duration_minutes: 50,
      started_at: "2026-07-07T10:00:00.000Z",
      ended_at: "2026-07-07T10:50:00.000Z",
      status: "completed",
      energy: 4,
      note: null,
      created_at: "2026-07-07T10:00:00.000Z"
    },
    {
      id: "focus-2",
      user_id: "user-1",
      task_id: null,
      title: "Admin block",
      duration_minutes: 25,
      started_at: "2026-07-06T10:00:00.000Z",
      ended_at: "2026-07-06T10:25:00.000Z",
      status: "completed",
      energy: 2,
      note: null,
      created_at: "2026-07-06T10:00:00.000Z"
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
  goals: [
    {
      id: "goal-1",
      user_id: "user-1",
      title: "Launch",
      notes: null,
      status: "active",
      target_at: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  goalMilestones: [
    {
      id: "milestone-1",
      user_id: "user-1",
      goal_id: "goal-1",
      title: "Build",
      completed_at: "2026-07-06T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z"
    },
    {
      id: "milestone-2",
      user_id: "user-1",
      goal_id: "goal-1",
      title: "Ship",
      completed_at: null,
      created_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  journalEntries: [
    {
      id: "journal-1",
      user_id: "user-1",
      mood: "good",
      title: null,
      body: "Solid",
      entry_date: "2026-07-07",
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z"
    }
  ]
};

describe("insights", () => {
  it("creates local date keys", () => {
    expect(localDateKey(now)).toMatch(/2026-07-07|2026-07-08/);
  });

  it("builds daily health and mood series", () => {
    expect(caloriesByDay(baseData, 1, now)).toEqual([{ date: localDateKey(now), label: "Tue", value: 500 }]);
    expect(workoutMinutesByDay(baseData, 1, now)[0].value).toBe(30);
    expect(journalMoodByDay(baseData, 1, now)[0].value).toBe(4);
  });

  it("calculates habit, weight, and overall summaries", () => {
    expect(habitCompletionRate(baseData.habits as Habit[], baseData.habitLogs as HabitLog[], now)).toBe(100);
    expect(weightTrend(baseData)).toEqual({ latest: 81.2, unit: "kg", delta: -0.8 });
    expect(insightSummary(baseData, now)).toMatchObject({
      averageCalories: 71,
      workoutMinutes: 30,
      habitCompletionRate: 100,
      goalProgressAverage: 50,
      sevenDayMood: "good",
      sleep: {
        sevenDayAverageMinutes: 420,
        sevenDayQuality: 4,
        nightsLogged: 1
      },
      focus: {
        weekMinutes: 75,
        sessionsLogged: 2,
        averageEnergy: 3
      }
    });
  });
});
