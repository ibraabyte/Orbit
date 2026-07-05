import { describe, expect, it } from "vitest";
import { allSearchResults, buildSearchResults, searchResultLabels, searchResultTypes } from "@/lib/search";
import type { DashboardData } from "@/lib/types";

const data: DashboardData = {
  profile: null,
  tasks: [
    {
      id: "task-1",
      user_id: "user-1",
      title: "Book dentist",
      notes: "Call clinic",
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
  reminders: [],
  captures: [
    {
      id: "capture-1",
      user_id: "user-1",
      type: "link",
      url: "https://x.com/example",
      title: "Thread about hypertrophy",
      note: "Save for workout plan",
      source: "x.com",
      created_at: "2026-07-02T00:00:00.000Z"
    }
  ],
  attachments: [
    {
      id: "attachment-1",
      user_id: "user-1",
      capture_id: "capture-1",
      bucket: "orbit-attachments",
      object_path: "user-1/capture-1/july-hypertrophy-screenshot.png",
      filename: "july-hypertrophy-screenshot.png",
      content_type: "image/png",
      size_bytes: 2400,
      created_at: "2026-07-02T00:00:00.000Z"
    }
  ],
  tags: [
    {
      id: "tag-admin",
      user_id: "user-1",
      name: "admin",
      color: null,
      created_at: "2026-07-01T00:00:00.000Z"
    },
    {
      id: "tag-research",
      user_id: "user-1",
      name: "research",
      color: null,
      created_at: "2026-07-01T00:00:00.000Z"
    },
    {
      id: "tag-prep",
      user_id: "user-1",
      name: "meal-prep",
      color: null,
      created_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  taggings: [
    {
      id: "tagging-task",
      user_id: "user-1",
      tag_id: "tag-admin",
      target_type: "task",
      target_id: "task-1",
      created_at: "2026-07-01T00:00:00.000Z"
    },
    {
      id: "tagging-capture",
      user_id: "user-1",
      tag_id: "tag-research",
      target_type: "capture",
      target_id: "capture-1",
      created_at: "2026-07-01T00:00:00.000Z"
    },
    {
      id: "tagging-meal-plan",
      user_id: "user-1",
      tag_id: "tag-prep",
      target_type: "meal_plan",
      target_id: "meal-plan-1",
      created_at: "2026-07-01T00:00:00.000Z"
    }
  ],
  meals: [],
  mealPlans: [
    {
      id: "meal-plan-1",
      user_id: "user-1",
      name: "Salmon dinner",
      plan_date: "2026-07-04",
      meal_type: "dinner",
      calories: 720,
      protein_g: 48,
      carbs_g: 55,
      fat_g: 24,
      note: "Prep rice",
      status: "planned",
      created_at: "2026-07-03T08:00:00.000Z",
      updated_at: "2026-07-03T08:00:00.000Z"
    }
  ],
  groceryItems: [
    {
      id: "grocery-1",
      user_id: "user-1",
      meal_plan_id: "meal-plan-1",
      name: "Greek yogurt",
      quantity: "1 tub",
      category: "dairy",
      status: "needed",
      due_at: "2026-07-04",
      created_at: "2026-07-03T08:00:00.000Z",
      updated_at: "2026-07-03T08:00:00.000Z"
    }
  ],
  people: [
    {
      id: "person-1",
      user_id: "user-1",
      name: "Sara",
      relationship: "friend",
      contact_method: "WhatsApp",
      birthday: "1996-07-12",
      last_contacted_at: null,
      next_follow_up_at: "2026-07-05",
      notes: "Ask about marathon training",
      favorite: true,
      created_at: "2026-07-03T08:00:00.000Z",
      updated_at: "2026-07-03T08:00:00.000Z"
    }
  ],
  weightLogs: [],
  workouts: [],
  sleepLogs: [
    {
      id: "sleep-1",
      user_id: "user-1",
      sleep_date: "2026-07-03",
      duration_minutes: 420,
      quality: 4,
      bedtime_at: null,
      woke_at: null,
      note: "Recovery night",
      created_at: "2026-07-03T08:00:00.000Z"
    }
  ],
  focusSessions: [
    {
      id: "focus-1",
      user_id: "user-1",
      task_id: null,
      title: "Deep work block",
      duration_minutes: 50,
      started_at: "2026-07-03T10:00:00.000Z",
      ended_at: "2026-07-03T10:50:00.000Z",
      status: "completed",
      energy: 4,
      note: "Write launch notes",
      created_at: "2026-07-03T10:00:00.000Z"
    }
  ],
  expenses: [
    {
      id: "expense-1",
      user_id: "user-1",
      merchant: "Coffee",
      amount: 4.5,
      currency: "USD",
      category: "food",
      note: "Morning",
      spent_at: "2026-07-03T08:00:00.000Z",
      created_at: "2026-07-03T08:00:00.000Z"
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
      due_at: "2026-07-10",
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
  goals: [],
  goalMilestones: [],
  journalEntries: []
};

describe("search", () => {
  it("creates searchable records for dashboard data", () => {
    expect(allSearchResults(data).map((result) => result.type)).toEqual(["task", "capture", "mealPlan", "grocery", "person", "sleep", "focus", "expense", "bill"]);
    expect(allSearchResults(data).find((result) => result.id === "task-task-1")?.tags).toEqual(["admin"]);
    expect(allSearchResults(data).find((result) => result.id === "capture-capture-1")?.tags).toEqual(["research"]);
  });

  it("searches title and detail fields and sorts newest first", () => {
    expect(buildSearchResults(data, "workout").map((result) => result.id)).toEqual(["capture-capture-1"]);
    expect(buildSearchResults(data, "hypertrophy-screenshot").map((result) => result.id)).toEqual(["capture-capture-1"]);
    expect(buildSearchResults(data, "twitter").map((result) => result.id)).toEqual(["capture-capture-1"]);
    expect(buildSearchResults(data, "clinic").map((result) => result.id)).toEqual(["task-task-1"]);
    expect(buildSearchResults(data, "recovery").map((result) => result.id)).toEqual(["sleep-sleep-1"]);
    expect(buildSearchResults(data, "deep").map((result) => result.id)).toEqual(["focus-focus-1"]);
    expect(buildSearchResults(data, "salmon").map((result) => result.id)).toEqual(["meal-plan-meal-plan-1"]);
    expect(buildSearchResults(data, "48g protein").map((result) => result.id)).toEqual(["meal-plan-meal-plan-1"]);
    expect(buildSearchResults(data, "yogurt").map((result) => result.id)).toEqual(["grocery-grocery-1"]);
    expect(buildSearchResults(data, "marathon").map((result) => result.id)).toEqual(["person-person-1"]);
    expect(buildSearchResults(data, "internet").map((result) => result.id)).toEqual(["bill-bill-1"]);
  });

  it("searches tag names across tagged records", () => {
    expect(buildSearchResults(data, "admin").map((result) => result.id)).toEqual(["task-task-1"]);
    expect(buildSearchResults(data, "research", "capture").map((result) => result.id)).toEqual(["capture-capture-1"]);
    expect(buildSearchResults(data, "meal-prep").map((result) => result.id)).toEqual(["meal-plan-meal-plan-1"]);
  });

  it("filters search results by type", () => {
    expect(buildSearchResults(data, "clinic", "task").map((result) => result.id)).toEqual(["task-task-1"]);
    expect(buildSearchResults(data, "clinic", "capture")).toEqual([]);
    expect(buildSearchResults(data, "salmon", "mealPlan").map((result) => result.id)).toEqual(["meal-plan-meal-plan-1"]);
  });

  it("keeps every result type labeled for filters", () => {
    expect(searchResultTypes.every((type) => Boolean(searchResultLabels[type]))).toBe(true);
  });

  it("returns no results for empty queries", () => {
    expect(buildSearchResults(data, "")).toEqual([]);
    expect(buildSearchResults(data, "", "task")).toEqual([]);
  });
});
