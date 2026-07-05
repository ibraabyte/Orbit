import { buildCalendarDays, type CalendarEvent, type CalendarEventKind } from "@/lib/calendar";
import { overdueTasks, weeklySummary } from "@/lib/dashboard";
import { financeSummary } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { focusSummary } from "@/lib/focus";
import { activeGoals, goalProgress } from "@/lib/goals";
import { habitProgress, startOfWeek } from "@/lib/habits";
import { averageMood, journalEntriesInLastDays } from "@/lib/journal";
import { peopleSummary } from "@/lib/people";
import { averageSleepMinutes, sleepLogsInLastDays } from "@/lib/sleep";
import type { DashboardData } from "@/lib/types";

export type PlanActionTone = "danger" | "warning" | "success" | "neutral";

export type PlanAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: PlanActionTone;
};

export type WeeklyPlan = {
  weekStart: string;
  weekEnd: string;
  taskLoad: {
    overdue: number;
    dueThisWeek: number;
    highPriority: number;
  };
  healthTargets: {
    caloriesTarget: number | null;
    calorieAverage: number;
    calorieDelta: number | null;
    workoutTarget: number;
    workoutMinutes: number;
    workoutRemaining: number;
    sleepAverageMinutes: number;
    sleepNights: number;
  };
  habitTargets: {
    active: number;
    complete: number;
    behind: number;
  };
  goalTargets: {
    active: number;
    dueThisWeek: number;
    averageProgress: number;
  };
  financeTargets: {
    weekSpend: number;
    expensesLogged: number;
    billsDueThisWeek: number;
    overdueBills: number;
    monthlyCommitments: number;
  };
  foodTargets: {
    todayPlannedMeals: number;
    todayPlannedCalories: number;
    plannedThisWeek: number;
    groceriesNeeded: number;
    groceriesDue: number;
    overdueMealPlans: number;
  };
  peopleTargets: {
    total: number;
    dueFollowUps: number;
    overdueFollowUps: number;
    upcomingBirthdays: number;
  };
  focusTargets: {
    weekMinutes: number;
    sessionsLogged: number;
    plannedThisWeek: number;
    overduePlanned: number;
  };
  review: {
    capturesSaved: number;
    journalEntries: number;
    averageMood: string | null;
  };
  actions: PlanAction[];
};

export type PlanAgendaLoad = "open" | "light" | "full" | "heavy";

export type PlanAgendaDay = {
  date: string;
  label: string;
  eventCount: number;
  timeSensitiveCount: number;
  load: PlanAgendaLoad;
  summary: string;
  events: CalendarEvent[];
  hiddenCount: number;
};

export function buildWeeklyPlan(data: DashboardData, now = new Date()): WeeklyPlan {
  const days = buildCalendarDays(data, 7, now);
  const overdue = overdueTasks(data.tasks, now);
  const dueTaskIds = new Set(days.flatMap((day) => day.events.filter((event) => event.kind === "task").map((event) => event.id.replace(/^task-due-/, ""))));
  const highPriority = data.tasks.filter((task) => task.status === "open" && task.priority === "high").length;
  const week = weeklySummary(data, now);
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const workoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const habitProgressRows = data.habits.map((habit) => habitProgress(habit, data.habitLogs, now));
  const sleepLogs = sleepLogsInLastDays(data.sleepLogs, 7, now);
  const sleepAverageMinutes = averageSleepMinutes(sleepLogs);
  const completeHabits = habitProgressRows.filter((progress) => progress.done).length;
  const goals = activeGoals(data.goals);
  const goalsDueThisWeek = days.flatMap((day) => day.events).filter((event) => event.kind === "goal").length;
  const billsDueThisWeek = days.flatMap((day) => day.events).filter((event) => event.kind === "bill").length;
  const finance = financeSummary(data, now);
  const food = foodSummary(data, now);
  const people = peopleSummary(data, now);
  const focus = focusSummary(data, now);
  const averageGoalProgress = goals.length
    ? Math.round(goals.reduce((sum, goal) => sum + goalProgress(goal, data.goalMilestones).percent, 0) / goals.length)
    : 0;
  const calorieDelta = calorieTarget === null ? null : week.averageCalories - calorieTarget;

  return {
    weekStart: localDate(startOfWeek(now)),
    weekEnd: localDate(addDays(startOfWeek(now), 6)),
    taskLoad: {
      overdue: overdue.length,
      dueThisWeek: dueTaskIds.size,
      highPriority
    },
    healthTargets: {
      caloriesTarget: calorieTarget,
      calorieAverage: week.averageCalories,
      calorieDelta,
      workoutTarget,
      workoutMinutes: week.workoutMinutes,
      workoutRemaining: Math.max(0, workoutTarget - week.workoutMinutes),
      sleepAverageMinutes,
      sleepNights: sleepLogs.length
    },
    habitTargets: {
      active: data.habits.length,
      complete: completeHabits,
      behind: Math.max(0, data.habits.length - completeHabits)
    },
    goalTargets: {
      active: goals.length,
      dueThisWeek: goalsDueThisWeek,
      averageProgress: averageGoalProgress
    },
    financeTargets: {
      weekSpend: week.spending,
      expensesLogged: week.expensesLogged,
      billsDueThisWeek,
      overdueBills: finance.overdueBills.length,
      monthlyCommitments: finance.monthlyCommitments
    },
    foodTargets: {
      todayPlannedMeals: food.todayPlannedMeals,
      todayPlannedCalories: food.todayPlannedCalories,
      plannedThisWeek: food.upcomingMealPlans.length,
      groceriesNeeded: food.neededGroceries.length,
      groceriesDue: food.dueGroceries.length,
      overdueMealPlans: food.overdueMealPlans.length
    },
    peopleTargets: {
      total: people.total,
      dueFollowUps: people.dueFollowUps.length,
      overdueFollowUps: people.overdueFollowUps.length,
      upcomingBirthdays: people.upcomingBirthdays.length
    },
    focusTargets: {
      weekMinutes: focus.weekMinutes,
      sessionsLogged: focus.sessionsLogged,
      plannedThisWeek: focus.plannedUpcoming.length,
      overduePlanned: focus.plannedOverdue.length
    },
    review: {
      capturesSaved: week.capturesSaved,
      journalEntries: week.journalEntries,
      averageMood: averageMood(journalEntriesInLastDays(data.journalEntries, 7, now))
    },
    actions: buildPlanActions({
      overdueCount: overdue.length,
      highPriority,
      overdueBills: finance.overdueBills.length,
      billsDueThisWeek,
      todayPlannedMeals: food.todayPlannedMeals,
      plannedMealsThisWeek: food.upcomingMealPlans.length,
      groceriesNeeded: food.neededGroceries.length,
      groceriesDue: food.dueGroceries.length,
      overdueMealPlans: food.overdueMealPlans.length,
      peopleDueFollowUps: people.dueFollowUps.length,
      peopleOverdueFollowUps: people.overdueFollowUps.length,
      peopleBirthdays: people.upcomingBirthdays.length,
      focusWeekMinutes: focus.weekMinutes,
      plannedFocus: focus.plannedUpcoming.length,
      overdueFocus: focus.plannedOverdue.length,
      workoutRemaining: Math.max(0, workoutTarget - week.workoutMinutes),
      sleepAverageMinutes,
      sleepNights: sleepLogs.length,
      habitBehind: Math.max(0, data.habits.length - completeHabits),
      goalsDueThisWeek,
      journalEntries: week.journalEntries,
      capturesSaved: week.capturesSaved,
      calorieTarget,
      calorieDelta
    })
  };
}

export function buildPlanAgenda(data: DashboardData, now = new Date()): PlanAgendaDay[] {
  return buildCalendarDays(data, 7, now).map((day) => {
    const timeSensitiveCount = day.events.filter((event) => timeSensitiveEventKinds.has(event.kind)).length;
    const load = planAgendaLoad(day.events.length, timeSensitiveCount);

    return {
      date: day.date,
      label: day.label,
      eventCount: day.events.length,
      timeSensitiveCount,
      load,
      summary: planAgendaSummary(day.events.length, timeSensitiveCount),
      events: day.events.slice(0, 3),
      hiddenCount: Math.max(0, day.events.length - 3)
    };
  });
}

function buildPlanActions({
  overdueCount,
  highPriority,
  overdueBills,
  billsDueThisWeek,
  todayPlannedMeals,
  plannedMealsThisWeek,
  groceriesNeeded,
  groceriesDue,
  overdueMealPlans,
  peopleDueFollowUps,
  peopleOverdueFollowUps,
  peopleBirthdays,
  focusWeekMinutes,
  plannedFocus,
  overdueFocus,
  workoutRemaining,
  sleepAverageMinutes,
  sleepNights,
  habitBehind,
  goalsDueThisWeek,
  journalEntries,
  capturesSaved,
  calorieTarget,
  calorieDelta
}: {
  overdueCount: number;
  highPriority: number;
  overdueBills: number;
  billsDueThisWeek: number;
  todayPlannedMeals: number;
  plannedMealsThisWeek: number;
  groceriesNeeded: number;
  groceriesDue: number;
  overdueMealPlans: number;
  peopleDueFollowUps: number;
  peopleOverdueFollowUps: number;
  peopleBirthdays: number;
  focusWeekMinutes: number;
  plannedFocus: number;
  overdueFocus: number;
  workoutRemaining: number;
  sleepAverageMinutes: number;
  sleepNights: number;
  habitBehind: number;
  goalsDueThisWeek: number;
  journalEntries: number;
  capturesSaved: number;
  calorieTarget: number | null;
  calorieDelta: number | null;
}) {
  const actions: PlanAction[] = [];

  if (overdueCount) {
    actions.push({
      id: "overdue",
      title: "Clear overdue work",
      detail: `${overdueCount} open task${overdueCount === 1 ? "" : "s"} past due.`,
      href: "/tasks",
      tone: "danger"
    });
  }

  if (highPriority) {
    actions.push({
      id: "priority",
      title: "Choose high-priority focus",
      detail: `${highPriority} high-priority task${highPriority === 1 ? "" : "s"} need sequencing.`,
      href: "/tasks",
      tone: "warning"
    });
  }

  if (overdueBills) {
    actions.push({
      id: "overdue-bills",
      title: "Clear overdue bills",
      detail: `${overdueBills} active bill${overdueBills === 1 ? "" : "s"} past due.`,
      href: "/finance",
      tone: "danger"
    });
  }

  if (billsDueThisWeek) {
    actions.push({
      id: "bills",
      title: "Confirm bills due this week",
      detail: `${billsDueThisWeek} bill${billsDueThisWeek === 1 ? "" : "s"} land in the next 7 days.`,
      href: "/finance",
      tone: "warning"
    });
  }

  if (overdueMealPlans) {
    actions.push({
      id: "overdue-meals",
      title: "Resolve old meal plans",
      detail: `${overdueMealPlans} planned meal${overdueMealPlans === 1 ? "" : "s"} still open from past days.`,
      href: "/food",
      tone: "warning"
    });
  }

  if (plannedMealsThisWeek === 0) {
    actions.push({
      id: "meal-plan",
      title: "Plan food for the week",
      detail: "No upcoming meals are planned for the next 7 days.",
      href: "/food",
      tone: "neutral"
    });
  } else if (todayPlannedMeals === 0) {
    actions.push({
      id: "meal-today",
      title: "Plan today’s food",
      detail: "No meals planned for today yet.",
      href: "/food",
      tone: "neutral"
    });
  }

  if (groceriesDue) {
    actions.push({
      id: "groceries",
      title: "Clear grocery queue",
      detail: `${groceriesDue} needed grocery item${groceriesDue === 1 ? "" : "s"} due soon.`,
      href: "/food",
      tone: groceriesNeeded >= 8 ? "warning" : "neutral"
    });
  }

  if (peopleOverdueFollowUps) {
    actions.push({
      id: "people-overdue",
      title: "Catch up with people",
      detail: `${peopleOverdueFollowUps} follow-up${peopleOverdueFollowUps === 1 ? "" : "s"} past due.`,
      href: "/people",
      tone: "warning"
    });
  } else if (peopleDueFollowUps) {
    actions.push({
      id: "people-follow-up",
      title: "Follow up with people",
      detail: `${peopleDueFollowUps} person follow-up${peopleDueFollowUps === 1 ? "" : "s"} due soon.`,
      href: "/people",
      tone: "neutral"
    });
  }

  if (peopleBirthdays) {
    actions.push({
      id: "people-birthdays",
      title: "Check upcoming birthdays",
      detail: `${peopleBirthdays} birthday${peopleBirthdays === 1 ? "" : "s"} in the next 30 days.`,
      href: "/people",
      tone: "neutral"
    });
  }

  if (overdueFocus) {
    actions.push({
      id: "overdue-focus",
      title: "Resolve missed focus blocks",
      detail: `${overdueFocus} planned focus block${overdueFocus === 1 ? "" : "s"} started in the past.`,
      href: "/focus",
      tone: "warning"
    });
  }

  if (highPriority && plannedFocus === 0) {
    actions.push({
      id: "focus-plan",
      title: "Block focus time",
      detail: `${highPriority} high-priority task${highPriority === 1 ? "" : "s"} with no planned focus blocks.`,
      href: "/focus",
      tone: "warning"
    });
  } else if (focusWeekMinutes === 0) {
    actions.push({
      id: "focus-log",
      title: "Log execution time",
      detail: "No completed focus minutes in the last 7 days.",
      href: "/focus",
      tone: "neutral"
    });
  }

  if (workoutRemaining > 0) {
    actions.push({
      id: "workout",
      title: "Schedule training time",
      detail: `${workoutRemaining} minutes left against your weekly target.`,
      href: "/health",
      tone: "warning"
    });
  }

  if (sleepNights < 3) {
    actions.push({
      id: "sleep-coverage",
      title: "Log recovery",
      detail: `${sleepNights} sleep night${sleepNights === 1 ? "" : "s"} logged in the last 7 days.`,
      href: "/health",
      tone: "neutral"
    });
  } else if (sleepAverageMinutes > 0 && sleepAverageMinutes < 360) {
    actions.push({
      id: "sleep",
      title: "Protect sleep",
      detail: `${Math.round(sleepAverageMinutes / 60)}h average sleep across recent logs.`,
      href: "/health",
      tone: "warning"
    });
  }

  if (habitBehind) {
    actions.push({
      id: "habits",
      title: "Protect habit streaks",
      detail: `${habitBehind} habit${habitBehind === 1 ? "" : "s"} still below target.`,
      href: "/habits",
      tone: "warning"
    });
  }

  if (goalsDueThisWeek) {
    actions.push({
      id: "goals",
      title: "Review goal deadlines",
      detail: `${goalsDueThisWeek} goal target${goalsDueThisWeek === 1 ? "" : "s"} land in the next 7 days.`,
      href: "/goals",
      tone: "warning"
    });
  }

  if (calorieTarget !== null && calorieDelta !== null && Math.abs(calorieDelta) >= 250) {
    actions.push({
      id: "calories",
      title: "Tune food plan",
      detail: `${Math.abs(calorieDelta)} calories ${calorieDelta > 0 ? "above" : "below"} your daily target on average.`,
      href: "/health",
      tone: calorieDelta > 0 ? "warning" : "neutral"
    });
  }

  if (journalEntries < 3) {
    actions.push({
      id: "journal",
      title: "Add reflection checkpoints",
      detail: `${journalEntries} journal entr${journalEntries === 1 ? "y" : "ies"} in the last 7 days.`,
      href: "/journal",
      tone: "neutral"
    });
  }

  if (capturesSaved >= 10) {
    actions.push({
      id: "captures",
      title: "Triage saved material",
      detail: `${capturesSaved} captures saved this week.`,
      href: "/library",
      tone: "neutral"
    });
  }

  if (!actions.length) {
    actions.push({
      id: "steady",
      title: "Keep the week steady",
      detail: "No urgent planning pressure found. Keep logging and reviewing daily.",
      href: "/dashboard",
      tone: "success"
    });
  }

  return actions.slice(0, 6);
}

const timeSensitiveEventKinds = new Set<CalendarEventKind>(["task", "reminder", "grocery", "person", "bill", "goal"]);

function planAgendaLoad(eventCount: number, timeSensitiveCount: number): PlanAgendaLoad {
  if (eventCount === 0) return "open";
  if (timeSensitiveCount >= 3 || eventCount >= 6) return "heavy";
  if (timeSensitiveCount >= 2 || eventCount >= 4) return "full";
  return "light";
}

function planAgendaSummary(eventCount: number, timeSensitiveCount: number) {
  if (eventCount === 0) return "Open day";
  if (timeSensitiveCount > 0) {
    return `${timeSensitiveCount} time-sensitive · ${eventCount} total`;
  }
  return `${eventCount} scheduled item${eventCount === 1 ? "" : "s"}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
