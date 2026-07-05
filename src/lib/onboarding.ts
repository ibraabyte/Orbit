import type { DashboardData } from "@/lib/types";

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href: string;
  complete: boolean;
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completeCount: number;
  totalCount: number;
  percent: number;
  nextSteps: OnboardingStep[];
  done: boolean;
};

export function buildOnboardingProgress(data: DashboardData): OnboardingProgress {
  const steps: OnboardingStep[] = [
    {
      id: "preferences",
      title: "Set owner preferences",
      detail: "Timezone, default weight unit, and health targets make Orbit personal.",
      href: "/settings",
      complete: hasPersonalPreferences(data)
    },
    {
      id: "task",
      title: "Create a task",
      detail: "Add the first thing you need to handle.",
      href: "/tasks",
      complete: data.tasks.length > 0
    },
    {
      id: "focus",
      title: "Plan or log focus",
      detail: "Give one task a work block so Orbit can track execution.",
      href: "/focus",
      complete: data.focusSessions.length > 0
    },
    {
      id: "reminder",
      title: "Schedule a reminder",
      detail: "Give Orbit one time-sensitive item to watch.",
      href: "/tasks",
      complete: data.reminders.length > 0 || data.tasks.some((task) => Boolean(task.reminder_at))
    },
    {
      id: "capture",
      title: "Save a capture",
      detail: "Store a link, note, or screenshot you would otherwise lose.",
      href: "/library",
      complete: data.captures.length > 0
    },
    {
      id: "health",
      title: "Log health once",
      detail: "Add a meal, workout, weight entry, or sleep log to start trends.",
      href: "/health",
      complete: data.meals.length > 0 || data.workouts.length > 0 || data.weightLogs.length > 0 || data.sleepLogs.length > 0
    },
    {
      id: "food",
      title: "Plan food once",
      detail: "Add one planned meal or grocery item before the week starts.",
      href: "/food",
      complete: data.mealPlans.length > 0 || data.groceryItems.length > 0
    },
    {
      id: "people",
      title: "Add a person",
      detail: "Track one birthday or follow-up so social admin shows up in planning.",
      href: "/people",
      complete: data.people.length > 0
    },
    {
      id: "habit",
      title: "Start a habit",
      detail: "Create one daily or weekly routine to track.",
      href: "/habits",
      complete: data.habits.length > 0
    },
    {
      id: "goal",
      title: "Add a goal",
      detail: "Create a larger outcome with milestones.",
      href: "/goals",
      complete: data.goals.length > 0
    },
    {
      id: "journal",
      title: "Write a journal entry",
      detail: "Capture a mood and quick reflection for review.",
      href: "/journal",
      complete: data.journalEntries.length > 0
    },
    {
      id: "finance",
      title: "Log money once",
      detail: "Add one expense, bill, or subscription to start the money view.",
      href: "/finance",
      complete: data.expenses.length > 0 || data.bills.length > 0
    }
  ];

  const completeCount = steps.filter((step) => step.complete).length;
  const totalCount = steps.length;

  return {
    steps,
    completeCount,
    totalCount,
    percent: Math.round((completeCount / totalCount) * 100),
    nextSteps: steps.filter((step) => !step.complete).slice(0, 4),
    done: completeCount === totalCount
  };
}

function hasPersonalPreferences(data: DashboardData) {
  const profile = data.profile;
  if (!profile) return false;
  return (
    profile.timezone !== "UTC" ||
    profile.weight_unit !== "kg" ||
    profile.daily_calorie_target !== null ||
    profile.daily_protein_target !== null ||
    profile.daily_carbs_target !== null ||
    profile.daily_fat_target !== null ||
    profile.weekly_workout_minutes_target !== 150
  );
}
