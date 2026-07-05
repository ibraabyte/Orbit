import { describe, expect, it } from "vitest";
import { buildOnboardingProgress } from "@/lib/onboarding";
import type { DashboardData } from "@/lib/types";

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    profile: null,
    tasks: [],
    reminders: [],
    captures: [],
    attachments: [],
    tags: [],
    taggings: [],
    meals: [],
    mealPlans: [],
    groceryItems: [],
    people: [],
    weightLogs: [],
    workouts: [],
    focusSessions: [],
    sleepLogs: [],
    habits: [],
    habitLogs: [],
    goals: [],
    goalMilestones: [],
    journalEntries: [],
    expenses: [],
    bills: [],
    ...overrides
  };
}

describe("onboarding progress", () => {
  it("returns first-run steps for an empty account", () => {
    const progress = buildOnboardingProgress(data());

    expect(progress.completeCount).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.nextSteps.map((step) => step.id)).toEqual(["preferences", "task", "focus", "reminder"]);
  });

  it("detects progress from existing records and reminders on tasks", () => {
    const progress = buildOnboardingProgress(
      data({
        profile: {
          id: "user-1",
          display_name: null,
          timezone: "Asia/Riyadh",
          weight_unit: "kg",
          daily_calorie_target: null,
          daily_protein_target: null,
          daily_carbs_target: null,
          daily_fat_target: null,
          weekly_workout_minutes_target: 150,
          dashboard_modules: null,
          created_at: "2026-07-01T00:00:00.000Z"
        },
        tasks: [
          {
            id: "task-1",
            user_id: "user-1",
            title: "Task",
            notes: null,
            status: "open",
            priority: "normal",
            due_at: null,
            reminder_at: "2026-07-01T10:00:00.000Z",
            reminder_sent_at: null,
            recurrence: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        captures: [
          {
            id: "capture-1",
            user_id: "user-1",
            type: "link",
            url: "https://example.com",
            title: "Example",
            note: null,
            source: "example.com",
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        workouts: [
          {
            id: "workout-1",
            user_id: "user-1",
            type: "Run",
            duration_minutes: 20,
            calories: null,
            notes: null,
            logged_at: "2026-07-01T00:00:00.000Z",
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ]
      })
    );

    expect(progress.steps.filter((step) => step.complete).map((step) => step.id)).toEqual(["preferences", "task", "reminder", "capture", "health"]);
    expect(progress.nextSteps.map((step) => step.id)).toEqual(["focus", "food", "people", "habit"]);
  });

  it("marks onboarding complete when each core area has data", () => {
    const progress = buildOnboardingProgress(
      data({
        profile: {
          id: "user-1",
          display_name: null,
          timezone: "UTC",
          weight_unit: "lb",
          daily_calorie_target: 2200,
          daily_protein_target: null,
          daily_carbs_target: null,
          daily_fat_target: null,
          weekly_workout_minutes_target: 180,
          dashboard_modules: null,
          created_at: "2026-07-01T00:00:00.000Z"
        },
        tasks: [
          {
            id: "task-1",
            user_id: "user-1",
            title: "Task",
            notes: null,
            status: "open",
            priority: "normal",
            due_at: null,
            reminder_at: null,
            reminder_sent_at: null,
            recurrence: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        reminders: [
          {
            id: "reminder-1",
            user_id: "user-1",
            task_id: null,
            title: "Reminder",
            body: null,
            remind_at: "2026-07-01T10:00:00.000Z",
            status: "scheduled",
            sent_at: null,
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        focusSessions: [
          {
            id: "focus-1",
            user_id: "user-1",
            task_id: "task-1",
            title: "Deep work",
            duration_minutes: 45,
            started_at: "2026-07-01T11:00:00.000Z",
            ended_at: "2026-07-01T11:45:00.000Z",
            status: "completed",
            energy: 4,
            note: null,
            created_at: "2026-07-01T11:00:00.000Z"
          }
        ],
        captures: [{ id: "capture-1", user_id: "user-1", type: "note", url: null, title: "Note", note: null, source: null, created_at: "2026-07-01T00:00:00.000Z" }],
        meals: [{ id: "meal-1", user_id: "user-1", name: "Meal", calories: 500, protein_g: null, carbs_g: null, fat_g: null, logged_at: "2026-07-01T00:00:00.000Z", created_at: "2026-07-01T00:00:00.000Z" }],
        mealPlans: [
          {
            id: "meal-plan-1",
            user_id: "user-1",
            name: "Dinner",
            plan_date: "2026-07-01",
            meal_type: "dinner",
            calories: 650,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            note: null,
            status: "planned",
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        people: [
          {
            id: "person-1",
            user_id: "user-1",
            name: "Sara",
            relationship: "friend",
            contact_method: null,
            birthday: null,
            last_contacted_at: null,
            next_follow_up_at: "2026-07-08",
            notes: null,
            favorite: false,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        habits: [{ id: "habit-1", user_id: "user-1", name: "Walk", frequency: "daily", target_count: 1, color: null, archived_at: null, created_at: "2026-07-01T00:00:00.000Z" }],
        goals: [{ id: "goal-1", user_id: "user-1", title: "Goal", notes: null, status: "active", target_at: null, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }],
        journalEntries: [{ id: "journal-1", user_id: "user-1", mood: "good", title: null, body: "Done", entry_date: "2026-07-01", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }],
        expenses: [
          {
            id: "expense-1",
            user_id: "user-1",
            merchant: "Coffee",
            amount: 4.5,
            currency: "USD",
            category: "food",
            note: null,
            spent_at: "2026-07-01T00:00:00.000Z",
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ]
      })
    );

    expect(progress.done).toBe(true);
    expect(progress.completeCount).toBe(progress.totalCount);
    expect(progress.nextSteps).toEqual([]);
  });
});
