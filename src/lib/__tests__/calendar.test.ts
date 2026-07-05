import { describe, expect, it } from "vitest";
import { buildCalendarDays, buildCalendarEvents, calendarEventCounts, calendarRange } from "@/lib/calendar";
import type { DashboardData } from "@/lib/types";

const now = new Date("2026-07-01T09:00:00.000Z");
const data: DashboardData = {
  profile: null,
  tasks: [
    {
      id: "task-1",
      user_id: "user-1",
      title: "Call gym",
      notes: null,
      status: "open",
      priority: "high",
      due_at: "2026-07-01T14:00:00.000Z",
      reminder_at: "2026-07-01T13:30:00.000Z",
      reminder_sent_at: null,
      recurrence: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  reminders: [],
  captures: [],
  attachments: [],
  tags: [],
  taggings: [],
  meals: [
    {
      id: "meal-1",
      user_id: "user-1",
      name: "Lunch",
      calories: 700,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      logged_at: "2026-07-02T12:00:00.000Z",
      created_at: "2026-07-02T12:00:00.000Z"
    }
  ],
  mealPlans: [
    {
      id: "meal-plan-1",
      user_id: "user-1",
      name: "Salmon dinner",
      plan_date: "2026-07-03",
      meal_type: "dinner",
      calories: 720,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      note: null,
      status: "planned",
      created_at: "2026-07-02T08:00:00.000Z",
      updated_at: "2026-07-02T08:00:00.000Z"
    }
  ],
  groceryItems: [
    {
      id: "grocery-1",
      user_id: "user-1",
      meal_plan_id: "meal-plan-1",
      name: "Rice",
      quantity: "1 bag",
      category: "pantry",
      status: "needed",
      due_at: "2026-07-03",
      created_at: "2026-07-02T08:00:00.000Z",
      updated_at: "2026-07-02T08:00:00.000Z"
    }
  ],
  people: [
    {
      id: "person-1",
      user_id: "user-1",
      name: "Sara",
      relationship: "family",
      contact_method: "WhatsApp",
      birthday: "1996-07-03",
      last_contacted_at: null,
      next_follow_up_at: "2026-07-02",
      notes: "Check in after trip",
      favorite: true,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  weightLogs: [],
  workouts: [],
  sleepLogs: [
    {
      id: "sleep-1",
      user_id: "user-1",
      sleep_date: "2026-07-02",
      duration_minutes: 420,
      quality: 4,
      bedtime_at: null,
      woke_at: null,
      note: null,
      created_at: "2026-07-02T08:00:00.000Z"
    }
  ],
  focusSessions: [
    {
      id: "focus-1",
      user_id: "user-1",
      task_id: null,
      title: "Deep work",
      duration_minutes: 45,
      started_at: "2026-07-02T10:00:00.000Z",
      ended_at: "2026-07-02T10:45:00.000Z",
      status: "completed",
      energy: 4,
      note: null,
      created_at: "2026-07-02T10:00:00.000Z"
    }
  ],
  expenses: [
    {
      id: "expense-1",
      user_id: "user-1",
      merchant: "Coffee",
      amount: 5,
      currency: "USD",
      category: "food",
      note: null,
      spent_at: "2026-07-02T09:00:00.000Z",
      created_at: "2026-07-02T09:00:00.000Z"
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
      due_at: "2026-07-01",
      recurrence: "monthly",
      status: "active",
      autopay: true,
      note: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  habits: [],
  habitLogs: [],
  goals: [
    {
      id: "goal-1",
      user_id: "user-1",
      title: "Finish Orbit",
      notes: null,
      status: "active",
      target_at: "2026-07-03",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  goalMilestones: [],
  journalEntries: [
    {
      id: "journal-1",
      user_id: "user-1",
      mood: "good",
      title: "Good day",
      body: "Progress",
      entry_date: "2026-07-01",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z"
    }
  ]
};

describe("calendar", () => {
  it("creates forward-looking date ranges", () => {
    expect(calendarRange(2, now).map((day) => day.date)).toHaveLength(2);
  });

  it("normalizes records into calendar events", () => {
    expect(buildCalendarEvents(data, now).map((event) => event.kind)).toEqual(["task", "reminder", "meal", "mealPlan", "grocery", "person", "person", "sleep", "focus", "expense", "bill", "journal", "goal"]);
  });

  it("groups and counts events by day", () => {
    const days = buildCalendarDays(data, 3, now);
    expect(days[0].events.map((event) => event.id)).toEqual(["bill-bill-1", "journal-journal-1", "task-reminder-task-1", "task-due-task-1"]);
    expect(calendarEventCounts(days)).toMatchObject({
      task: 1,
      reminder: 1,
      meal: 1,
      mealPlan: 1,
      grocery: 1,
      person: 2,
      sleep: 1,
      focus: 1,
      expense: 1,
      bill: 1,
      journal: 1,
      goal: 1
    });
  });
});
