import { describe, expect, it } from "vitest";
import {
  buildDailyBrief,
  dueReminders,
  dueTaskReminders,
  overdueTasks,
  scheduledReminders,
  summarizeDashboard,
  todaysCalories,
  todaysSleepMinutes,
  todaysSpending,
  todaysTasks,
  weeklySummary
} from "@/lib/dashboard";
import type { Bill, DashboardData, FocusSession, Goal, GroceryItem, Habit, HabitLog, Meal, MealPlan, Person, Reminder, SleepLog, Task, Workout } from "@/lib/types";

const now = new Date("2026-07-01T12:00:00.000Z");

function task(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    title: "Task",
    notes: null,
    status: "open",
    priority: "normal",
    due_at: null,
    reminder_at: null,
    reminder_sent_at: null,
    recurrence: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function reminder(overrides: Partial<Reminder>): Reminder {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    task_id: null,
    title: "Reminder",
    body: null,
    remind_at: now.toISOString(),
    status: "scheduled",
    sent_at: null,
    created_at: now.toISOString(),
    ...overrides
  };
}

function meal(overrides: Partial<Meal>): Meal {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    name: "Meal",
    calories: 500,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    logged_at: now.toISOString(),
    created_at: now.toISOString(),
    ...overrides
  };
}

function workout(overrides: Partial<Workout>): Workout {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    type: "Run",
    duration_minutes: 30,
    calories: null,
    notes: null,
    logged_at: now.toISOString(),
    created_at: now.toISOString(),
    ...overrides
  };
}

function focusSession(overrides: Partial<FocusSession>): FocusSession {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    task_id: null,
    title: "Focus",
    duration_minutes: 50,
    started_at: now.toISOString(),
    ended_at: "2026-07-01T12:50:00.000Z",
    status: "completed",
    energy: 4,
    note: null,
    created_at: now.toISOString(),
    ...overrides
  };
}

function person(overrides: Partial<Person>): Person {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    name: "Person",
    relationship: null,
    contact_method: null,
    birthday: null,
    last_contacted_at: null,
    next_follow_up_at: null,
    notes: null,
    favorite: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    name: "Bill",
    amount: 25,
    currency: "USD",
    category: "home",
    due_at: "2026-07-01",
    recurrence: "once",
    status: "active",
    autopay: false,
    note: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function mealPlan(overrides: Partial<MealPlan>): MealPlan {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    name: "Meal plan",
    plan_date: "2026-07-01",
    meal_type: "lunch",
    calories: 500,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    note: null,
    status: "planned",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function groceryItem(overrides: Partial<GroceryItem>): GroceryItem {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    meal_plan_id: null,
    name: "Groceries",
    quantity: null,
    category: "other",
    status: "needed",
    due_at: "2026-07-01",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function habit(overrides: Partial<Habit>): Habit {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    name: "Habit",
    frequency: "daily",
    target_count: 1,
    color: null,
    archived_at: null,
    created_at: now.toISOString(),
    ...overrides
  };
}

function habitLog(overrides: Partial<HabitLog>): HabitLog {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    habit_id: "habit-1",
    logged_at: now.toISOString(),
    note: null,
    created_at: now.toISOString(),
    ...overrides
  };
}

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    title: "Goal",
    notes: null,
    status: "active",
    target_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...overrides
  };
}

function sleepLog(overrides: Partial<SleepLog>): SleepLog {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    sleep_date: "2026-07-01",
    duration_minutes: 420,
    quality: 4,
    bedtime_at: null,
    woke_at: null,
    note: null,
    created_at: now.toISOString(),
    ...overrides
  };
}

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
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
    sleepLogs: [],
    focusSessions: [],
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

describe("dashboard summaries", () => {
  it("groups today's open tasks by due date or reminder date", () => {
    const tasks = [
      task({ title: "Due today", due_at: "2026-07-01T18:00:00.000Z" }),
      task({ title: "Reminder today", reminder_at: "2026-07-01T08:00:00.000Z" }),
      task({ title: "Future", due_at: "2026-07-02T08:00:00.000Z" }),
      task({ title: "Done today", status: "done", due_at: "2026-07-01T08:00:00.000Z" })
    ];

    expect(todaysTasks(tasks, now).map((item) => item.title)).toEqual(["Due today", "Reminder today"]);
  });

  it("keeps overdue tasks separate from tasks due today", () => {
    const tasks = [
      task({ title: "Yesterday", due_at: "2026-06-30T18:00:00.000Z" }),
      task({ title: "Today earlier", due_at: "2026-07-01T08:00:00.000Z" })
    ];

    expect(overdueTasks(tasks, now).map((item) => item.title)).toEqual(["Yesterday"]);
  });

  it("totals only today's calories", () => {
    expect(
      todaysCalories(
        [meal({ calories: 400 }), meal({ calories: 300 }), meal({ calories: 900, logged_at: "2026-06-30T20:00:00.000Z" })],
        now
      )
    ).toBe(700);
  });

  it("returns due scheduled reminders in chronological order", () => {
    const reminders = [
      reminder({ title: "Later", remind_at: "2026-07-01T11:00:00.000Z" }),
      reminder({ title: "Cancelled", status: "cancelled", remind_at: "2026-07-01T09:00:00.000Z" }),
      reminder({ title: "Future", remind_at: "2026-07-01T15:00:00.000Z" }),
      reminder({ title: "Earlier", remind_at: "2026-07-01T08:00:00.000Z" })
    ];

    expect(dueReminders(reminders, now).map((item) => item.title)).toEqual(["Earlier", "Later"]);
  });

  it("filters linked reminders for completed or already-notified tasks", () => {
    const openTask = task({ id: "task-open" });
    const doneTask = task({ id: "task-done", status: "done" });
    const notifiedTask = task({ id: "task-notified", reminder_sent_at: "2026-07-01T10:01:00.000Z" });
    const reminders = [
      reminder({ title: "Standalone", remind_at: "2026-07-01T08:00:00.000Z" }),
      reminder({ title: "Open linked", task_id: "task-open", remind_at: "2026-07-01T08:30:00.000Z" }),
      reminder({ title: "Done linked", task_id: "task-done", remind_at: "2026-07-01T09:00:00.000Z" }),
      reminder({ title: "Notified linked", task_id: "task-notified", remind_at: "2026-07-01T09:30:00.000Z" }),
      reminder({ title: "Missing linked", task_id: "task-missing", remind_at: "2026-07-01T10:00:00.000Z" })
    ];

    expect(dueReminders(reminders, now, [openTask, doneTask, notifiedTask]).map((item) => item.title)).toEqual([
      "Standalone",
      "Open linked"
    ]);
    expect(scheduledReminders(reminders, [openTask, doneTask, notifiedTask]).map((item) => item.title)).toEqual([
      "Standalone",
      "Open linked"
    ]);
  });

  it("returns due task reminders without duplicating linked reminder rows", () => {
    const dueTask = task({ id: "task-due", title: "Direct task reminder", reminder_at: "2026-07-01T08:00:00.000Z" });
    const linkedTask = task({ id: "task-linked", title: "Linked task reminder", reminder_at: "2026-07-01T08:30:00.000Z" });
    const sentTask = task({ id: "task-sent", title: "Already sent", reminder_at: "2026-07-01T08:45:00.000Z", reminder_sent_at: "2026-07-01T09:00:00.000Z" });
    const futureTask = task({ id: "task-future", title: "Future", reminder_at: "2026-07-01T15:00:00.000Z" });

    expect(
      dueTaskReminders(
        [futureTask, linkedTask, sentTask, dueTask],
        [reminder({ task_id: "task-linked", remind_at: "2026-07-01T08:30:00.000Z" })],
        now
      ).map((item) => item.title)
    ).toEqual(["Direct task reminder"]);
  });

  it("summarizes the dashboard data needed by Today", () => {
    const data: DashboardData = {
      profile: null,
      tasks: [task({ due_at: "2026-07-01T18:00:00.000Z" }), task({ due_at: "2026-06-30T18:00:00.000Z" })],
      reminders: [reminder({ remind_at: "2026-07-01T08:00:00.000Z" })],
      captures: [
        {
          id: "capture-1",
          user_id: "user-1",
          type: "link",
          url: "https://example.com",
          title: "Example",
          note: null,
          source: "example.com",
          created_at: now.toISOString()
        }
      ],
      attachments: [],
      tags: [],
      taggings: [],
      meals: [meal({ calories: 650 })],
      mealPlans: [],
      groceryItems: [],
      people: [],
      weightLogs: [
        {
          id: "weight-1",
          user_id: "user-1",
          weight: 82.5,
          unit: "kg",
          logged_at: now.toISOString(),
          created_at: now.toISOString()
        }
      ],
      workouts: [workout({ duration_minutes: 45 })],
      focusSessions: [focusSession({ duration_minutes: 50 })],
      sleepLogs: [
        {
          id: "sleep-1",
          user_id: "user-1",
          sleep_date: "2026-07-01",
          duration_minutes: 420,
          quality: 4,
          bedtime_at: null,
          woke_at: null,
          note: null,
          created_at: now.toISOString()
        }
      ],
      expenses: [
        {
          id: "expense-1",
          user_id: "user-1",
          merchant: "Coffee",
          amount: 12,
          currency: "USD",
          category: "food",
          note: null,
          spent_at: now.toISOString(),
          created_at: now.toISOString()
        }
      ],
      bills: [],
      habits: [
        {
          id: "habit-1",
          user_id: "user-1",
          name: "Walk",
          frequency: "daily",
          target_count: 1,
          color: null,
          archived_at: null,
          created_at: now.toISOString()
        }
      ],
      habitLogs: [
        {
          id: "habit-log-1",
          user_id: "user-1",
          habit_id: "habit-1",
          logged_at: now.toISOString(),
          note: null,
          created_at: now.toISOString()
        }
      ],
      goals: [
        {
          id: "goal-1",
          user_id: "user-1",
          title: "Goal",
          notes: null,
          status: "active",
          target_at: null,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        }
      ],
      goalMilestones: [],
      journalEntries: [
        {
          id: "journal-1",
          user_id: "user-1",
          mood: "good",
          title: null,
          body: "Good day",
          entry_date: "2026-07-01",
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        }
      ]
    };

    expect(summarizeDashboard(data, now)).toMatchObject({
      openTaskCount: 2,
      todayTaskCount: 1,
      overdueTaskCount: 1,
      dueReminderCount: 1,
      todayCalories: 650,
      todayWorkoutMinutes: 45,
      todaySpending: 12,
      todaySleepMinutes: 420,
      todayFocusMinutes: 50,
      latestWeight: 82.5,
      recentCaptureCount: 1,
      completedHabitCount: 1,
      activeHabitCount: 1,
      activeGoalCount: 1,
      completedGoalCount: 0,
      journaledToday: true,
      sevenDayMood: "good"
    });

    expect(weeklySummary(data, now)).toMatchObject({
      completedTasks: 0,
      workoutMinutes: 45,
      averageCalories: 93,
      capturesSaved: 1,
      spending: 12,
      expensesLogged: 1,
      focusMinutes: 50,
      focusSessions: 1,
      sleepAverageMinutes: 420,
      sleepNights: 1,
      habitCheckIns: 1,
      journalEntries: 1
    });
    expect(todaysSpending(data.expenses, now)).toBe(12);
    expect(todaysSleepMinutes(data.sleepLogs, now)).toBe(420);
  });

  it("builds a prioritized daily brief across modules", () => {
    const data = dashboardData({
      tasks: [
        task({ title: "Overdue", due_at: "2026-06-30T18:00:00.000Z" }),
        task({ title: "Today", due_at: "2026-07-01T18:00:00.000Z" })
      ],
      reminders: [reminder({ remind_at: "2026-07-01T08:00:00.000Z" })],
      people: [person({ next_follow_up_at: "2026-06-29" })],
      bills: [bill({ due_at: "2026-06-30" })],
      mealPlans: [mealPlan({ plan_date: "2026-06-30" })],
      groceryItems: [groceryItem({ due_at: "2026-07-01" })],
      habits: [habit({ id: "habit-1" })],
      goals: [goal({ target_at: "2026-07-04" })]
    });

    expect(buildDailyBrief(data, now, 6).map((item) => item.id)).toEqual([
      "due-reminders",
      "overdue-tasks",
      "overdue-bills",
      "overdue-followups",
      "overdue-meal-plans",
      "due-groceries"
    ]);
  });

  it("falls back to missing daily logs when urgent items are clear", () => {
    const data = dashboardData({
      mealPlans: [mealPlan({ plan_date: "2026-07-01", status: "planned" })],
      meals: [meal({ calories: 600 })],
      workouts: [workout({ duration_minutes: 150 })],
      sleepLogs: [sleepLog({})],
      habits: [habit({ id: "habit-1" })],
      habitLogs: [habitLog({ habit_id: "habit-1" })],
      captures: [
        {
          id: "capture-1",
          user_id: "user-1",
          type: "note",
          url: null,
          title: "Idea",
          note: null,
          source: null,
          created_at: now.toISOString()
        }
      ]
    });

    expect(buildDailyBrief(data, now, 3).map((item) => item.id)).toEqual(["journal"]);
  });
});
