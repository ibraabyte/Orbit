import { buildCalendarDays, type CalendarEvent, type CalendarEventKind } from "@/lib/calendar";
import { dueReminders, dueTaskReminders, summarizeDashboard, weeklySummary } from "@/lib/dashboard";
import { formatShortDate, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { formatFocusDuration } from "@/lib/focus";
import { todayEntry } from "@/lib/journal";
import { peopleSummary } from "@/lib/people";
import { buildWeeklyPlan, type PlanActionTone } from "@/lib/planning";
import { formatSleepDuration } from "@/lib/sleep";
import type { DashboardData, JournalMood } from "@/lib/types";

export type ReviewMode = "morning" | "evening" | "weekly";

export type ReviewTone = PlanActionTone;

export type ReviewAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: ReviewTone;
};

export type ReviewMetric = {
  label: string;
  value: string | number;
  detail: string;
  tone?: "danger" | "warning" | "success";
};

export type ReviewHandoff = {
  date: string;
  label: string;
  eventCount: number;
  timeSensitiveCount: number;
  events: CalendarEvent[];
  hiddenCount: number;
  firstMove: ReviewAction;
};

export type ReviewSummary = {
  mode: ReviewMode;
  date: string;
  score: number;
  scoreLabel: "steady" | "needs attention" | "at risk";
  metrics: ReviewMetric[];
  highlights: string[];
  gaps: string[];
  prompts: string[];
  actions: ReviewAction[];
  handoff: ReviewHandoff;
  journalDraft: {
    mood: JournalMood;
    title: string;
    body: string;
  };
};

export function buildReviewSummary(data: DashboardData, mode: ReviewMode = "evening", now = new Date()): ReviewSummary {
  const summary = summarizeDashboard(data, now);
  const week = weeklySummary(data, now);
  const plan = buildWeeklyPlan(data, now);
  const food = foodSummary(data, now);
  const people = peopleSummary(data, now);
  const today = localDate(now);
  const entry = todayEntry(data.journalEntries, now);
  const habitsBehind = Math.max(0, summary.activeHabitCount - summary.completedHabitCount);
  const highPriorityOpen = data.tasks.filter((task) => task.status === "open" && task.priority === "high").length;
  const overdueReminders = dueReminders(data.reminders, now, data.tasks).length + dueTaskReminders(data.tasks, data.reminders, now).length;
  const score = reviewScore({
    overdueTasks: summary.overdueTaskCount,
    dueReminders: overdueReminders,
    habitsBehind,
    activeHabits: summary.activeHabitCount,
    todayFocusMinutes: summary.todayFocusMinutes,
    highPriorityOpen,
    todaySleepMinutes: summary.todaySleepMinutes,
    journaledToday: Boolean(entry),
    overdueBills: plan.financeTargets.overdueBills,
    overdueFocus: plan.focusTargets.overduePlanned,
    groceriesDue: food.dueGroceries.length,
    peopleOverdue: people.overdueFollowUps.length
  });

  const highlights = [
    people.upcomingBirthdays.length ? `${people.upcomingBirthdays.length} birthday${people.upcomingBirthdays.length === 1 ? "" : "s"} coming up` : null,
    food.todayPlannedMeals > 0 ? `${food.todayPlannedMeals} meal${food.todayPlannedMeals === 1 ? "" : "s"} planned today` : null,
    summary.todayFocusMinutes > 0 ? `${formatFocusDuration(summary.todayFocusMinutes)} focused today` : null,
    summary.todayWorkoutMinutes > 0 ? `${summary.todayWorkoutMinutes} training minutes logged` : null,
    summary.todaySleepMinutes > 0 ? `${formatSleepDuration(summary.todaySleepMinutes)} sleep recorded` : null,
    summary.activeHabitCount > 0 && habitsBehind === 0 ? "All active habits checked in" : null,
    summary.journaledToday ? "Today already has a journal entry" : null,
    week.completedTasks > 0 ? `${week.completedTasks} tasks completed this week` : null,
    summary.overdueTaskCount === 0 ? "No overdue tasks" : null
  ].filter(Boolean) as string[];

  const gaps = [
    summary.overdueTaskCount ? `${summary.overdueTaskCount} overdue task${summary.overdueTaskCount === 1 ? "" : "s"}` : null,
    overdueReminders ? `${overdueReminders} reminder${overdueReminders === 1 ? "" : "s"} due now` : null,
    highPriorityOpen && summary.todayFocusMinutes === 0 ? "High-priority work has no focus time today" : null,
    summary.activeHabitCount > 0 && habitsBehind > 0 ? `${habitsBehind} habit${habitsBehind === 1 ? "" : "s"} still behind` : null,
    summary.todaySleepMinutes === 0 ? "No sleep logged for today" : null,
    !entry ? "No journal reflection saved today" : null,
    food.dueGroceries.length ? `${food.dueGroceries.length} grocery item${food.dueGroceries.length === 1 ? "" : "s"} due soon` : null,
    people.overdueFollowUps.length ? `${people.overdueFollowUps.length} people follow-up${people.overdueFollowUps.length === 1 ? "" : "s"} overdue` : null,
    food.overdueMealPlans.length ? `${food.overdueMealPlans.length} old meal plan${food.overdueMealPlans.length === 1 ? "" : "s"} still open` : null,
    plan.financeTargets.overdueBills ? `${plan.financeTargets.overdueBills} overdue bill${plan.financeTargets.overdueBills === 1 ? "" : "s"}` : null,
    plan.focusTargets.overduePlanned ? `${plan.focusTargets.overduePlanned} missed focus block${plan.focusTargets.overduePlanned === 1 ? "" : "s"}` : null
  ].filter(Boolean) as string[];

  const actions = reviewActions(data, mode, now);
  const prompts = reviewPrompts(mode, gaps);
  const handoff = buildTomorrowHandoff(data, highPriorityOpen, now);

  return {
    mode,
    date: today,
    score,
    scoreLabel: score >= 85 ? "steady" : score >= 65 ? "needs attention" : "at risk",
    metrics: [
      {
        label: "Readiness",
        value: `${score}%`,
        detail: score >= 85 ? "Stable day" : score >= 65 ? "Needs a short reset" : "Needs attention",
        tone: score >= 85 ? "success" : score >= 65 ? "warning" : "danger"
      },
      {
        label: "Focus",
        value: formatFocusDuration(summary.todayFocusMinutes),
        detail: `${formatFocusDuration(week.focusMinutes)} this week`,
        tone: summary.todayFocusMinutes ? "success" : highPriorityOpen ? "warning" : undefined
      },
      {
        label: "Health",
        value: summary.todayCalories,
        detail: `${summary.todayWorkoutMinutes}m training · ${formatSleepDuration(summary.todaySleepMinutes)} sleep`,
        tone: summary.todaySleepMinutes ? undefined : "warning"
      },
      {
        label: "Food",
        value: food.todayPlannedMeals,
        detail: `${food.neededGroceries.length} groceries needed`,
        tone: food.dueGroceries.length ? "warning" : food.todayPlannedMeals ? "success" : undefined
      },
      {
        label: "People",
        value: people.dueFollowUps.length,
        detail: `${people.upcomingBirthdays.length} birthdays soon`,
        tone: people.overdueFollowUps.length ? "warning" : people.dueFollowUps.length ? undefined : people.total ? "success" : undefined
      },
      {
        label: "Money",
        value: formatMoney(summary.todaySpending),
        detail: `${formatMoney(week.spending)} spent this week`,
        tone: plan.financeTargets.overdueBills ? "danger" : undefined
      },
      {
        label: "Habits",
        value: `${summary.completedHabitCount}/${summary.activeHabitCount}`,
        detail: summary.activeHabitCount ? `${habitsBehind} behind` : "No active habits",
        tone: summary.activeHabitCount && habitsBehind === 0 ? "success" : habitsBehind ? "warning" : undefined
      },
      {
        label: "Journal",
        value: entry ? "saved" : "open",
        detail: week.journalEntries ? `${week.journalEntries} entries this week` : "No recent entries",
        tone: entry ? "success" : "warning"
      }
    ],
    highlights: highlights.slice(0, 6),
    gaps: gaps.slice(0, 6),
    prompts,
    actions,
    handoff,
    journalDraft: entry
      ? {
          mood: entry.mood,
          title: entry.title ?? reviewTitle(mode, today),
          body: entry.body
        }
      : {
          mood: suggestedMood(score),
          title: reviewTitle(mode, today),
          body: buildJournalDraft(mode, highlights, gaps, prompts)
        }
  };
}

export function buildTomorrowHandoff(data: DashboardData, highPriorityOpen = 0, now = new Date()): ReviewHandoff {
  const tomorrow = addDays(now, 1);
  const day = buildCalendarDays(data, 1, tomorrow)[0];
  const timeSensitiveEvents = day.events.filter((event) => tomorrowTimeSensitiveEventKinds.has(event.kind));
  const firstEvent = timeSensitiveEvents[0] ?? day.events[0] ?? null;
  const firstMove: ReviewAction = firstEvent
    ? {
        id: `tomorrow-${firstEvent.id}`,
        title: `Start with ${firstEvent.title}`,
        detail: `${formatTime(firstEvent.at)} · ${firstEvent.detail}`,
        href: firstEvent.href,
        tone: handoffTone(firstEvent.kind)
      }
    : highPriorityOpen
      ? {
          id: "tomorrow-priority",
          title: "Choose tomorrow’s first task",
          detail: `${highPriorityOpen} high-priority task${highPriorityOpen === 1 ? "" : "s"} still need a first move.`,
          href: "/tasks",
          tone: "warning"
        }
      : {
          id: "tomorrow-open",
          title: "Keep tomorrow open",
          detail: "No dated items are scheduled. Use the space deliberately.",
          href: "/plan",
          tone: "success"
        };

  return {
    date: day.date,
    label: formatShortDate(day.date),
    eventCount: day.events.length,
    timeSensitiveCount: timeSensitiveEvents.length,
    events: day.events.slice(0, 4),
    hiddenCount: Math.max(0, day.events.length - 4),
    firstMove
  };
}

function reviewActions(data: DashboardData, mode: ReviewMode, now: Date): ReviewAction[] {
  const summary = summarizeDashboard(data, now);
  const plan = buildWeeklyPlan(data, now);
  const entry = todayEntry(data.journalEntries, now);
  const actions: ReviewAction[] = [];

  if (summary.overdueTaskCount) {
    actions.push({
      id: "overdue-tasks",
      title: "Clear overdue work",
      detail: `${summary.overdueTaskCount} open task${summary.overdueTaskCount === 1 ? "" : "s"} past due.`,
      href: "/tasks",
      tone: "danger"
    });
  }

  if (summary.dueReminderCount) {
    actions.push({
      id: "due-reminders",
      title: "Handle due reminders",
      detail: `${summary.dueReminderCount} reminder${summary.dueReminderCount === 1 ? "" : "s"} waiting now.`,
      href: "/inbox",
      tone: "warning"
    });
  }

  if (plan.focusTargets.overduePlanned) {
    actions.push({
      id: "missed-focus",
      title: "Resolve missed focus",
      detail: `${plan.focusTargets.overduePlanned} planned block${plan.focusTargets.overduePlanned === 1 ? "" : "s"} started in the past.`,
      href: "/focus",
      tone: "warning"
    });
  } else if (plan.taskLoad.highPriority && plan.focusTargets.plannedThisWeek === 0 && mode !== "evening") {
    actions.push({
      id: "plan-focus",
      title: "Block focus time",
      detail: `${plan.taskLoad.highPriority} high-priority task${plan.taskLoad.highPriority === 1 ? "" : "s"} need execution time.`,
      href: "/focus",
      tone: "warning"
    });
  }

  if (plan.financeTargets.overdueBills) {
    actions.push({
      id: "overdue-bills",
      title: "Clear overdue bills",
      detail: `${plan.financeTargets.overdueBills} active bill${plan.financeTargets.overdueBills === 1 ? "" : "s"} past due.`,
      href: "/finance",
      tone: "danger"
    });
  }

  if (plan.habitTargets.behind) {
    actions.push({
      id: "habits",
      title: "Protect habits",
      detail: `${plan.habitTargets.behind} habit${plan.habitTargets.behind === 1 ? "" : "s"} still below target.`,
      href: "/habits",
      tone: "warning"
    });
  }

  if (!entry) {
    actions.push({
      id: "journal",
      title: "Save today’s reflection",
      detail: "A short review makes weekly planning more accurate.",
      href: "/review",
      tone: "neutral"
    });
  }

  if (plan.foodTargets.groceriesDue) {
    actions.push({
      id: "groceries",
      title: "Clear grocery queue",
      detail: `${plan.foodTargets.groceriesDue} grocery item${plan.foodTargets.groceriesDue === 1 ? "" : "s"} due soon.`,
      href: "/food",
      tone: plan.foodTargets.groceriesNeeded >= 8 ? "warning" : "neutral"
    });
  } else if (mode !== "evening" && plan.foodTargets.plannedThisWeek === 0) {
    actions.push({
      id: "meal-plan",
      title: "Plan food",
      detail: "No meals planned for the next 7 days.",
      href: "/food",
      tone: "neutral"
    });
  }

  if (plan.peopleTargets.overdueFollowUps) {
    actions.push({
      id: "people-overdue",
      title: "Catch up with people",
      detail: `${plan.peopleTargets.overdueFollowUps} follow-up${plan.peopleTargets.overdueFollowUps === 1 ? "" : "s"} past due.`,
      href: "/people",
      tone: "warning"
    });
  } else if (mode !== "evening" && plan.peopleTargets.dueFollowUps) {
    actions.push({
      id: "people-follow-up",
      title: "Follow up with people",
      detail: `${plan.peopleTargets.dueFollowUps} person follow-up${plan.peopleTargets.dueFollowUps === 1 ? "" : "s"} due soon.`,
      href: "/people",
      tone: "neutral"
    });
  }

  if (mode === "weekly" && plan.review.capturesSaved >= 5) {
    actions.push({
      id: "captures",
      title: "Review saved material",
      detail: `${plan.review.capturesSaved} captures saved this week.`,
      href: "/library",
      tone: "neutral"
    });
  }

  if (!actions.length) {
    actions.push({
      id: "steady",
      title: "Keep the loop closed",
      detail: "No urgent review items found. Save a short note and keep logging.",
      href: "/review",
      tone: "success"
    });
  }

  return actions.slice(0, 6);
}

function reviewScore({
  overdueTasks,
  dueReminders,
  habitsBehind,
  activeHabits,
  todayFocusMinutes,
  highPriorityOpen,
  todaySleepMinutes,
  journaledToday,
  overdueBills,
  overdueFocus,
  groceriesDue,
  peopleOverdue
}: {
  overdueTasks: number;
  dueReminders: number;
  habitsBehind: number;
  activeHabits: number;
  todayFocusMinutes: number;
  highPriorityOpen: number;
  todaySleepMinutes: number;
  journaledToday: boolean;
  overdueBills: number;
  overdueFocus: number;
  groceriesDue: number;
  peopleOverdue: number;
}) {
  const deductions = [
    Math.min(25, overdueTasks * 10),
    Math.min(12, dueReminders * 4),
    activeHabits ? Math.min(15, habitsBehind * 5) : 0,
    highPriorityOpen && todayFocusMinutes === 0 ? 12 : 0,
    todaySleepMinutes === 0 ? 8 : todaySleepMinutes < 360 ? 5 : 0,
    journaledToday ? 0 : 8,
    Math.min(18, overdueBills * 9),
    Math.min(12, overdueFocus * 6),
    Math.min(8, groceriesDue * 4),
    Math.min(8, peopleOverdue * 4)
  ];

  return Math.max(0, 100 - deductions.reduce((sum, value) => sum + value, 0));
}

function reviewPrompts(mode: ReviewMode, gaps: string[]) {
  if (mode === "morning") {
    return [
      "What is the one outcome that would make today successful?",
      "Which task needs protected focus time?",
      gaps.length ? "What will you intentionally ignore today?" : "What should stay unchanged from yesterday?"
    ];
  }

  if (mode === "weekly") {
    return [
      "What pattern showed up across work, health, money, and mood?",
      "Which recurring friction should be removed next week?",
      "What deserves a planned block before the week gets noisy?"
    ];
  }

  return [
    "What moved forward today?",
    "What slipped or created friction?",
    "What is the first useful move for tomorrow?"
  ];
}

function buildJournalDraft(mode: ReviewMode, highlights: string[], gaps: string[], prompts: string[]) {
  return [
    `${modeLabel(mode)} review`,
    "",
    "Highlights:",
    ...highlights.slice(0, 3).map((item) => `- ${item}`),
    "",
    "Attention:",
    ...gaps.slice(0, 3).map((item) => `- ${item}`),
    "",
    "Notes:",
    ...prompts.map((prompt) => `- ${prompt}`)
  ].join("\n");
}

function reviewTitle(mode: ReviewMode, date: string) {
  return `${modeLabel(mode)} review · ${date}`;
}

function modeLabel(mode: ReviewMode) {
  if (mode === "morning") return "Morning";
  if (mode === "weekly") return "Weekly";
  return "Evening";
}

function suggestedMood(score: number): JournalMood {
  if (score >= 90) return "great";
  if (score >= 75) return "good";
  if (score >= 55) return "neutral";
  if (score >= 35) return "low";
  return "bad";
}

const tomorrowTimeSensitiveEventKinds = new Set<CalendarEventKind>(["task", "reminder", "grocery", "person", "bill", "goal", "focus"]);

function handoffTone(kind: CalendarEventKind): ReviewTone {
  if (kind === "task" || kind === "reminder" || kind === "bill" || kind === "goal") return "warning";
  if (kind === "focus" || kind === "mealPlan" || kind === "workout" || kind === "sleep") return "success";
  return "neutral";
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
