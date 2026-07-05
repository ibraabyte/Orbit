import { describe, expect, it } from "vitest";
import { buildTriageSummary, triageActionsForItem } from "@/lib/triage";
import type { Capture, DashboardData, Goal, Habit, Task } from "@/lib/types";

const now = new Date("2026-07-10T12:00:00.000Z");

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

function task(overrides: Partial<Task>): Task {
  return {
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
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function capture(overrides: Partial<Capture>): Capture {
  return {
    id: "capture-1",
    user_id: "user-1",
    type: "link",
    url: "https://example.com",
    title: "Capture",
    note: null,
    source: "example.com",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function habit(overrides: Partial<Habit>): Habit {
  return {
    id: "habit-1",
    user_id: "user-1",
    name: "Walk",
    frequency: "daily",
    target_count: 1,
    color: null,
    archived_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: "goal-1",
    user_id: "user-1",
    title: "Goal",
    notes: null,
    status: "active",
    target_at: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    ...overrides
  };
}

describe("triage summary", () => {
  it("surfaces overdue, unscheduled, untagged, stale, and missing review items", () => {
    const summary = buildTriageSummary(
      data({
        tasks: [
          task({ id: "overdue", title: "Overdue", due_at: "2026-07-01T10:00:00.000Z", priority: "high" }),
          task({ id: "loose", title: "Loose" })
        ],
        reminders: [
          {
            id: "reminder-1",
            user_id: "user-1",
            task_id: null,
            title: "Call",
            body: null,
            remind_at: "2026-07-10T08:00:00.000Z",
            status: "scheduled",
            sent_at: null,
            created_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        captures: [capture({ id: "capture-1" })],
        expenses: [
          {
            id: "expense-1",
            user_id: "user-1",
            merchant: "Coffee",
            amount: 5,
            currency: "USD",
            category: "other",
            note: null,
            spent_at: "2026-07-09T08:00:00.000Z",
            created_at: "2026-07-09T08:00:00.000Z"
          }
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
        ],
        people: [
          {
            id: "person-1",
            user_id: "user-1",
            name: "Sara",
            relationship: "friend",
            contact_method: "WhatsApp",
            birthday: null,
            last_contacted_at: null,
            next_follow_up_at: "2026-07-08",
            notes: null,
            favorite: false,
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z"
          }
        ],
        habits: [habit({ id: "habit-1" })],
        goals: [goal({ id: "goal-1" })]
      }),
      now
    );

    expect(summary.counts).toMatchObject({
      task: 4,
      reminder: 1,
      capture: 1,
      focus: 1,
      health: 1,
      finance: 2,
      people: 1,
      habit: 1,
      goal: 1,
      journal: 1
    });
    expect(summary.items[0]).toMatchObject({ id: "bill-overdue-bill-1", tone: "danger" });
    expect(summary.items.map((item) => item.id)).toContain("task-overdue-overdue");
    expect(summary.items.map((item) => item.id)).toContain("focus-missing");
    expect(summary.items.map((item) => item.id)).toContain("people-overdue-person-1");
    expect(summary.items.map((item) => item.id)).toContain("journal-missing");
  });

  it("does not surface tagged records or recently updated review records", () => {
    const summary = buildTriageSummary(
      data({
        tasks: [task({ id: "task-1", due_at: "2026-07-12T10:00:00.000Z" })],
        captures: [capture({ id: "capture-1" })],
        taggings: [
          { id: "tagging-1", user_id: "user-1", tag_id: "tag-1", target_type: "task", target_id: "task-1", created_at: "2026-07-01T00:00:00.000Z" },
          { id: "tagging-2", user_id: "user-1", tag_id: "tag-1", target_type: "capture", target_id: "capture-1", created_at: "2026-07-01T00:00:00.000Z" },
          { id: "tagging-3", user_id: "user-1", tag_id: "tag-1", target_type: "sleep", target_id: "sleep-1", created_at: "2026-07-10T00:00:00.000Z" }
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
            created_at: "2026-07-10T00:00:00.000Z"
          }
        ],
        habits: [habit({ id: "habit-1" })],
        habitLogs: [
          {
            id: "habit-log-1",
            user_id: "user-1",
            habit_id: "habit-1",
            logged_at: "2026-07-10T07:00:00.000Z",
            note: null,
            created_at: "2026-07-10T07:00:00.000Z"
          }
        ],
        goals: [goal({ id: "goal-1", updated_at: "2026-07-09T00:00:00.000Z" })],
        journalEntries: [
          {
            id: "journal-1",
            user_id: "user-1",
            mood: "good",
            title: null,
            body: "Checked in",
            entry_date: "2026-07-10",
            created_at: "2026-07-10T00:00:00.000Z",
            updated_at: "2026-07-10T00:00:00.000Z"
          }
        ]
      }),
      now
    );

    expect(summary.items.map((item) => item.id)).toEqual([]);
    expect(summary.total).toBe(0);
  });

  it("surfaces direct task reminders as reminder triage", () => {
    const summary = buildTriageSummary(
      data({
        tasks: [task({ id: "task-reminder", title: "Call gym", reminder_at: "2026-07-10T08:00:00.000Z" })]
      }),
      now
    );

    expect(summary.counts.reminder).toBe(1);
    expect(summary.items.map((item) => item.id)).toContain("task-reminder-due-task-reminder");
  });

  it("maps deterministic inbox items to direct actions", () => {
    expect(triageActionsForItem({ id: "task-overdue-task-with-hyphen" })).toEqual([
      { type: "complete-task", label: "Complete", targetId: "task-with-hyphen" }
    ]);
    expect(triageActionsForItem({ id: "reminder-due-reminder-1" })).toEqual([
      { type: "ack-reminder", label: "Done", targetId: "reminder-1" },
      { type: "snooze-reminder", label: "+1h", targetId: "reminder-1" }
    ]);
    expect(triageActionsForItem({ id: "task-reminder-due-task-1" })).toEqual([
      { type: "ack-task-reminder", label: "Done", targetId: "task-1" },
      { type: "snooze-task-reminder", label: "+1h", targetId: "task-1" }
    ]);
    expect(triageActionsForItem({ id: "grocery-due-grocery-1" })).toEqual([{ type: "buy-grocery", label: "Bought", targetId: "grocery-1" }]);
    expect(triageActionsForItem({ id: "capture-untagged-capture-1" })).toEqual([
      { type: "task-capture", label: "Make task", targetId: "capture-1" },
      { type: "remind-capture", label: "Remind", targetId: "capture-1" }
    ]);
  });
});
