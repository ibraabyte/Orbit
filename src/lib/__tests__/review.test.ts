import { describe, expect, it } from "vitest";
import { buildReviewSummary } from "@/lib/review";
import type { DashboardData } from "@/lib/types";

const now = new Date("2026-07-10T12:00:00.000Z");

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
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

describe("review summary", () => {
  it("turns cross-module pressure into review actions and a lower score", () => {
    const review = buildReviewSummary(
      baseData({
        tasks: [
          {
            id: "task-1",
            user_id: "user-1",
            title: "Ship release",
            notes: null,
            status: "open",
            priority: "high",
            due_at: "2026-07-08T10:00:00.000Z",
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
            title: "Call bank",
            body: null,
            remind_at: "2026-07-10T08:00:00.000Z",
            status: "scheduled",
            sent_at: null,
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        habits: [
          { id: "habit-1", user_id: "user-1", name: "Walk", frequency: "daily", target_count: 1, color: null, archived_at: null, created_at: "2026-07-01T00:00:00.000Z" },
          { id: "habit-2", user_id: "user-1", name: "Read", frequency: "daily", target_count: 1, color: null, archived_at: null, created_at: "2026-07-01T00:00:00.000Z" }
        ],
        habitLogs: [
          { id: "habit-log-1", user_id: "user-1", habit_id: "habit-1", logged_at: "2026-07-10T07:00:00.000Z", note: null, created_at: "2026-07-10T07:00:00.000Z" }
        ],
        bills: [
          {
            id: "bill-1",
            user_id: "user-1",
            name: "Internet",
            amount: 65,
            currency: "USD",
            category: "home",
            due_at: "2026-07-08",
            recurrence: "monthly",
            status: "active",
            autopay: false,
            note: null,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ]
      }),
      "morning",
      now
    );

    expect(review.score).toBe(44);
    expect(review.scoreLabel).toBe("at risk");
    expect(review.gaps).toEqual(
      expect.arrayContaining([
        "1 overdue task",
        "1 reminder due now",
        "High-priority work has no focus time today",
        "1 habit still behind",
        "No sleep logged for today",
        "No journal reflection saved today"
      ])
    );
    expect(review.actions.map((action) => action.id)).toEqual(["overdue-tasks", "due-reminders", "plan-focus", "overdue-bills", "habits", "journal"]);
    expect(review.journalDraft.mood).toBe("low");
  });

  it("keeps a steady day focused on closing the loop", () => {
    const review = buildReviewSummary(
      baseData({
        focusSessions: [
          {
            id: "focus-1",
            user_id: "user-1",
            task_id: null,
            title: "Deep work",
            duration_minutes: 60,
            started_at: "2026-07-10T09:00:00.000Z",
            ended_at: "2026-07-10T10:00:00.000Z",
            status: "completed",
            energy: 4,
            note: null,
            created_at: "2026-07-10T09:00:00.000Z"
          }
        ],
        sleepLogs: [
          {
            id: "sleep-1",
            user_id: "user-1",
            sleep_date: "2026-07-10",
            duration_minutes: 420,
            quality: 4,
            bedtime_at: null,
            woke_at: null,
            note: null,
            created_at: "2026-07-10T08:00:00.000Z"
          }
        ],
        habits: [{ id: "habit-1", user_id: "user-1", name: "Walk", frequency: "daily", target_count: 1, color: null, archived_at: null, created_at: "2026-07-01T00:00:00.000Z" }],
        habitLogs: [
          { id: "habit-log-1", user_id: "user-1", habit_id: "habit-1", logged_at: "2026-07-10T07:00:00.000Z", note: null, created_at: "2026-07-10T07:00:00.000Z" }
        ],
        journalEntries: [
          {
            id: "journal-1",
            user_id: "user-1",
            mood: "good",
            title: "Daily review",
            body: "Done.",
            entry_date: "2026-07-10",
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:00.000Z"
          }
        ]
      }),
      "evening",
      now
    );

    expect(review.score).toBe(100);
    expect(review.scoreLabel).toBe("steady");
    expect(review.actions).toEqual([
      {
        id: "steady",
        title: "Keep the loop closed",
        detail: "No urgent review items found. Save a short note and keep logging.",
        href: "/review",
        tone: "success"
      }
    ]);
    expect(review.highlights).toEqual(expect.arrayContaining(["1h focused today", "All active habits checked in"]));
    expect(review.journalDraft.body).toBe("Done.");
    expect(review.handoff.firstMove).toMatchObject({
      id: "tomorrow-open",
      title: "Keep tomorrow open",
      href: "/plan",
      tone: "success"
    });
  });

  it("builds a tomorrow handoff from calendar events", () => {
    const review = buildReviewSummary(
      baseData({
        tasks: [
          {
            id: "task-2",
            user_id: "user-1",
            title: "Morning lift",
            notes: null,
            status: "open",
            priority: "high",
            due_at: "2026-07-11T08:30:00.000Z",
            reminder_at: null,
            reminder_sent_at: null,
            recurrence: null,
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:00.000Z"
          }
        ],
        mealPlans: [
          {
            id: "meal-plan-2",
            user_id: "user-1",
            name: "Chicken bowl",
            plan_date: "2026-07-11",
            meal_type: "lunch",
            calories: 650,
            protein_g: 45,
            carbs_g: 62,
            fat_g: 18,
            note: null,
            status: "planned",
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:00.000Z"
          }
        ]
      }),
      "evening",
      now
    );

    expect(review.handoff).toMatchObject({
      date: "2026-07-11",
      eventCount: 2,
      timeSensitiveCount: 1,
      hiddenCount: 0
    });
    expect(review.handoff.events.map((event) => event.id)).toEqual(["task-due-task-2", "meal-plan-meal-plan-2"]);
    expect(review.handoff.firstMove).toMatchObject({
      id: "tomorrow-task-due-task-2",
      title: "Start with Morning lift",
      href: "/tasks",
      tone: "warning"
    });
  });
});
