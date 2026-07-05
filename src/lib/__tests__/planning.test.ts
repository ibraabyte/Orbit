import { describe, expect, it } from "vitest";
import { buildPlanAgenda, buildWeeklyPlan } from "@/lib/planning";
import type { DashboardData, FocusSession, Goal, Habit, Meal, MealPlan, Task, Workout } from "@/lib/types";

const now = new Date("2026-07-08T12:00:00.000Z");

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    profile: {
      id: "user-1",
      display_name: "Ibrahim",
      timezone: "Asia/Riyadh",
      weight_unit: "kg",
      daily_calorie_target: 2000,
      daily_protein_target: null,
      daily_carbs_target: null,
      daily_fat_target: null,
      weekly_workout_minutes_target: 180,
      dashboard_modules: null,
      created_at: "2026-07-01T00:00:00.000Z"
    },
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

function focusSession(overrides: Partial<FocusSession>): FocusSession {
  return {
    id: "focus-1",
    user_id: "user-1",
    task_id: null,
    title: "Deep work",
    duration_minutes: 60,
    started_at: "2026-07-08T10:00:00.000Z",
    ended_at: "2026-07-08T11:00:00.000Z",
    status: "completed",
    energy: 4,
    note: null,
    created_at: "2026-07-08T10:00:00.000Z",
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

function meal(overrides: Partial<Meal>): Meal {
  return {
    id: "meal-1",
    user_id: "user-1",
    name: "Meal",
    calories: 2500,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    logged_at: "2026-07-08T08:00:00.000Z",
    created_at: "2026-07-08T08:00:00.000Z",
    ...overrides
  };
}

function mealPlan(overrides: Partial<MealPlan>): MealPlan {
  return {
    id: "meal-plan-1",
    user_id: "user-1",
    name: "Dinner",
    plan_date: "2026-07-08",
    meal_type: "dinner",
    calories: 700,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    note: null,
    status: "planned",
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
    ...overrides
  };
}

function workout(overrides: Partial<Workout>): Workout {
  return {
    id: "workout-1",
    user_id: "user-1",
    type: "Run",
    duration_minutes: 60,
    calories: null,
    notes: null,
    logged_at: "2026-07-08T09:00:00.000Z",
    created_at: "2026-07-08T09:00:00.000Z",
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
    title: "Launch",
    notes: null,
    status: "active",
    target_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("weekly planning", () => {
  it("summarizes work, health, habits, goals, and planning actions", () => {
    const plan = buildWeeklyPlan(
      baseData({
        tasks: [
          task({ id: "overdue", title: "Overdue", priority: "high", due_at: "2026-07-06T10:00:00.000Z" }),
          task({ id: "this-week", title: "This week", due_at: "2026-07-10T10:00:00.000Z" })
        ],
        meals: [meal({ calories: 2500 }), meal({ id: "meal-2", calories: 2500, logged_at: "2026-07-07T08:00:00.000Z" })],
        workouts: [workout({ duration_minutes: 60 })],
        habits: [habit({ id: "habit-1" }), habit({ id: "habit-2", name: "Read" })],
        habitLogs: [
          {
            id: "habit-log-1",
            user_id: "user-1",
            habit_id: "habit-1",
            logged_at: "2026-07-08T07:00:00.000Z",
            note: null,
            created_at: "2026-07-08T07:00:00.000Z"
          }
        ],
        goals: [goal({ target_at: "2026-07-11" })],
        goalMilestones: [
          { id: "milestone-1", user_id: "user-1", goal_id: "goal-1", title: "Draft", completed_at: "2026-07-07T00:00:00.000Z", created_at: "2026-07-01T00:00:00.000Z" },
          { id: "milestone-2", user_id: "user-1", goal_id: "goal-1", title: "Ship", completed_at: null, created_at: "2026-07-01T00:00:00.000Z" }
        ],
        journalEntries: [
          { id: "journal-1", user_id: "user-1", mood: "good", title: null, body: "Solid", entry_date: "2026-07-08", created_at: "2026-07-08T00:00:00.000Z", updated_at: "2026-07-08T00:00:00.000Z" }
        ]
      }),
      now
    );

    expect(plan.taskLoad).toEqual({ overdue: 1, dueThisWeek: 1, highPriority: 1 });
    expect(plan.healthTargets).toMatchObject({
      caloriesTarget: 2000,
      calorieAverage: 714,
      calorieDelta: -1286,
      workoutTarget: 180,
      workoutMinutes: 60,
      workoutRemaining: 120,
      sleepAverageMinutes: 0,
      sleepNights: 0
    });
    expect(plan.habitTargets).toEqual({ active: 2, complete: 1, behind: 1 });
    expect(plan.goalTargets).toEqual({ active: 1, dueThisWeek: 1, averageProgress: 50 });
    expect(plan.financeTargets).toEqual({ weekSpend: 0, expensesLogged: 0, billsDueThisWeek: 0, overdueBills: 0, monthlyCommitments: 0 });
    expect(plan.foodTargets).toEqual({ todayPlannedMeals: 0, todayPlannedCalories: 0, plannedThisWeek: 0, groceriesNeeded: 0, groceriesDue: 0, overdueMealPlans: 0 });
    expect(plan.peopleTargets).toEqual({ total: 0, dueFollowUps: 0, overdueFollowUps: 0, upcomingBirthdays: 0 });
    expect(plan.focusTargets).toEqual({ weekMinutes: 0, sessionsLogged: 0, plannedThisWeek: 0, overduePlanned: 0 });
    expect(plan.actions.map((action) => action.id)).toEqual(["overdue", "priority", "meal-plan", "focus-plan", "workout", "sleep-coverage"]);
  });

  it("returns a steady-state action when no planning pressure is found", () => {
    const plan = buildWeeklyPlan(
      baseData({
        profile: null,
        workouts: [workout({ duration_minutes: 180 })],
        mealPlans: [
          {
            id: "meal-plan-1",
            user_id: "user-1",
            name: "Dinner",
            plan_date: "2026-07-08",
            meal_type: "dinner",
            calories: 700,
            protein_g: null,
            carbs_g: null,
            fat_g: null,
            note: null,
            status: "planned",
            created_at: "2026-07-08T00:00:00.000Z",
            updated_at: "2026-07-08T00:00:00.000Z"
          }
        ],
        focusSessions: [focusSession({ duration_minutes: 75 })],
        sleepLogs: [
          { id: "sleep-1", user_id: "user-1", sleep_date: "2026-07-08", duration_minutes: 420, quality: 4, bedtime_at: null, woke_at: null, note: null, created_at: "2026-07-08T00:00:00.000Z" },
          { id: "sleep-2", user_id: "user-1", sleep_date: "2026-07-07", duration_minutes: 420, quality: 4, bedtime_at: null, woke_at: null, note: null, created_at: "2026-07-07T00:00:00.000Z" },
          { id: "sleep-3", user_id: "user-1", sleep_date: "2026-07-06", duration_minutes: 420, quality: 4, bedtime_at: null, woke_at: null, note: null, created_at: "2026-07-06T00:00:00.000Z" }
        ],
        journalEntries: [
          { id: "journal-1", user_id: "user-1", mood: "good", title: null, body: "One", entry_date: "2026-07-08", created_at: "2026-07-08T00:00:00.000Z", updated_at: "2026-07-08T00:00:00.000Z" },
          { id: "journal-2", user_id: "user-1", mood: "good", title: null, body: "Two", entry_date: "2026-07-07", created_at: "2026-07-07T00:00:00.000Z", updated_at: "2026-07-07T00:00:00.000Z" },
          { id: "journal-3", user_id: "user-1", mood: "good", title: null, body: "Three", entry_date: "2026-07-06", created_at: "2026-07-06T00:00:00.000Z", updated_at: "2026-07-06T00:00:00.000Z" }
        ]
      }),
      now
    );

    expect(plan.healthTargets.workoutRemaining).toBe(0);
    expect(plan.actions).toEqual([
      {
        id: "steady",
        title: "Keep the week steady",
        detail: "No urgent planning pressure found. Keep logging and reviewing daily.",
        href: "/dashboard",
        tone: "success"
      }
    ]);
  });

  it("builds a day-by-day execution agenda with visible overflow", () => {
    const agenda = buildPlanAgenda(
      baseData({
        tasks: [
          task({
            due_at: "2026-07-08T10:00:00.000Z",
            reminder_at: "2026-07-08T09:00:00.000Z"
          })
        ],
        mealPlans: [mealPlan({})],
        focusSessions: [focusSession({ started_at: "2026-07-08T13:00:00.000Z", ended_at: null, status: "planned" })],
        goals: [goal({ target_at: "2026-07-08" })]
      }),
      now
    );

    expect(agenda).toHaveLength(7);
    expect(agenda[0]).toMatchObject({
      date: "2026-07-08",
      eventCount: 5,
      timeSensitiveCount: 3,
      load: "heavy",
      summary: "3 time-sensitive · 5 total",
      hiddenCount: 2
    });
    expect(agenda[0].events.map((event) => event.id)).toEqual(["task-reminder-task-1", "meal-plan-meal-plan-1", "goal-goal-1"]);
    expect(agenda[1]).toMatchObject({
      eventCount: 0,
      load: "open",
      summary: "Open day"
    });
  });
});
