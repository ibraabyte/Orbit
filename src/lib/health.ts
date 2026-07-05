import { todaysCalories } from "@/lib/dashboard";
import { isToday } from "@/lib/dates";
import { averageSleepMinutes, sleepLogsInLastDays } from "@/lib/sleep";
import type { DashboardData, Meal, WeightLog, WeightUnit } from "@/lib/types";

export type MacroKey = "protein" | "carbs" | "fat";

export type MacroTotals = Record<MacroKey, number>;

export type MacroTargets = Record<MacroKey, number | null>;

export type HealthSnapshot = {
  todayCalories: number;
  calorieTarget: number | null;
  calorieDelta: number | null;
  todayMacros: MacroTotals;
  macroTargets: MacroTargets;
  workoutMinutes: number;
  workoutTarget: number;
  workoutRemaining: number;
  sleepAverageMinutes: number;
  sleepNights: number;
  latestWeight: number | null;
  weightUnit: WeightUnit | null;
  weightDelta: number | null;
};

export function buildHealthSnapshot(
  data: Pick<DashboardData, "meals" | "workouts" | "sleepLogs" | "weightLogs">,
  {
    dailyCalorieTarget = null,
    dailyProteinTarget = null,
    dailyCarbsTarget = null,
    dailyFatTarget = null,
    weeklyWorkoutTarget = 150,
    now = new Date()
  }: {
    dailyCalorieTarget?: number | null;
    dailyProteinTarget?: number | null;
    dailyCarbsTarget?: number | null;
    dailyFatTarget?: number | null;
    weeklyWorkoutTarget?: number;
    now?: Date;
  } = {}
): HealthSnapshot {
  const sleepLogs = sleepLogsInLastDays(data.sleepLogs, 7, now);
  const weight = latestWeightTrend(data.weightLogs);
  const workoutMinutes = workoutsInLastDays(data.workouts, 7, now).reduce((sum, workout) => sum + (workout.duration_minutes ?? 0), 0);
  const todayCalories = todaysCalories(data.meals, now);
  const todayMacros = todaysMacros(data.meals, now);

  return {
    todayCalories,
    calorieTarget: dailyCalorieTarget,
    calorieDelta: dailyCalorieTarget === null ? null : todayCalories - dailyCalorieTarget,
    todayMacros,
    macroTargets: {
      protein: dailyProteinTarget,
      carbs: dailyCarbsTarget,
      fat: dailyFatTarget
    },
    workoutMinutes,
    workoutTarget: weeklyWorkoutTarget,
    workoutRemaining: Math.max(0, weeklyWorkoutTarget - workoutMinutes),
    sleepAverageMinutes: averageSleepMinutes(sleepLogs),
    sleepNights: sleepLogs.length,
    latestWeight: weight.latest,
    weightUnit: weight.unit,
    weightDelta: weight.delta
  };
}

export function todaysMacros(meals: Meal[], now = new Date()): MacroTotals {
  return meals
    .filter((meal) => isToday(meal.logged_at, now))
    .reduce(
      (totals, meal) => ({
        protein: totals.protein + Number(meal.protein_g ?? 0),
        carbs: totals.carbs + Number(meal.carbs_g ?? 0),
        fat: totals.fat + Number(meal.fat_g ?? 0)
      }),
      { protein: 0, carbs: 0, fat: 0 }
    );
}

export function macroTargetDelta(actual: number, target: number | null) {
  return target === null ? null : Number((actual - target).toFixed(1));
}

function workoutsInLastDays(data: Pick<DashboardData, "workouts">["workouts"], days: number, now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return data.filter((workout) => {
    const loggedAt = new Date(workout.logged_at);
    return loggedAt >= start && loggedAt <= now;
  });
}

function latestWeightTrend(weightLogs: WeightLog[]) {
  const [latest, previous] = weightLogs;
  return {
    latest: latest?.weight ?? null,
    unit: latest?.unit ?? null,
    delta: latest && previous ? Number((latest.weight - previous.weight).toFixed(1)) : null
  };
}
