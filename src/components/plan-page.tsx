"use client";

import Link from "next/link";
import { Bed, CalendarDays, ClipboardCheck, CreditCard, Dumbbell, Flag, Repeat2, ShoppingBasket, SquareCheckBig, Timer, Users, Utensils } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildCalendarDays } from "@/lib/calendar";
import { formatShortDate, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { formatFocusDuration } from "@/lib/focus";
import { formatSleepDuration } from "@/lib/sleep";
import { buildPlanAgenda, buildWeeklyPlan, type PlanActionTone, type PlanAgendaLoad } from "@/lib/planning";

type PlanTone = "danger" | "warning" | "success";

export function PlanPage() {
  const { user } = useAuth();
  const { data, loading, error } = useDashboardData(user?.id);
  const plan = useMemo(() => buildWeeklyPlan(data), [data]);
  const agendaDays = useMemo(() => buildPlanAgenda(data), [data]);
  const upcomingDays = useMemo(() => buildCalendarDays(data, 7), [data]);
  const upcomingEvents = upcomingDays.flatMap((day) => day.events).slice(0, 8);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Plan" subtitle={`Shape the week from ${plan.weekStart} to ${plan.weekEnd}.`}>
        <ButtonLink href="/review" size="sm">
          <ClipboardCheck size={15} aria-hidden="true" />
          Review
        </ButtonLink>
        <ButtonLink href="/calendar" size="sm">
          <CalendarDays size={15} aria-hidden="true" />
          Calendar
        </ButtonLink>
      </PageHeader>
      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {!loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <PlanTile icon={<SquareCheckBig size={16} />} label="Due this week" value={plan.taskLoad.dueThisWeek} detail={`${plan.taskLoad.overdue} overdue`} tone={plan.taskLoad.overdue ? "danger" : undefined} />
            <PlanTile icon={<Timer size={16} />} label="Focus" value={formatFocusDuration(plan.focusTargets.weekMinutes)} detail={`${plan.focusTargets.plannedThisWeek} planned`} tone={plan.focusTargets.overduePlanned ? "warning" : undefined} />
            <PlanTile icon={<Dumbbell size={16} />} label="Training left" value={`${plan.healthTargets.workoutRemaining}m`} detail={`${plan.healthTargets.workoutMinutes}/${plan.healthTargets.workoutTarget} min`} tone={plan.healthTargets.workoutRemaining ? "warning" : "success"} />
            <PlanTile icon={<Utensils size={16} />} label="Meals planned" value={plan.foodTargets.plannedThisWeek} detail={`${plan.foodTargets.todayPlannedMeals} today`} tone={plan.foodTargets.overdueMealPlans ? "warning" : undefined} />
            <PlanTile icon={<ShoppingBasket size={16} />} label="Groceries" value={plan.foodTargets.groceriesNeeded} detail={`${plan.foodTargets.groceriesDue} due soon`} tone={plan.foodTargets.groceriesDue ? "warning" : undefined} />
            <PlanTile icon={<Users size={16} />} label="People" value={plan.peopleTargets.dueFollowUps} detail={`${plan.peopleTargets.upcomingBirthdays} birthdays`} tone={plan.peopleTargets.overdueFollowUps ? "warning" : undefined} />
            <PlanTile icon={<Bed size={16} />} label="Avg sleep" value={formatSleepDuration(plan.healthTargets.sleepAverageMinutes)} detail={`${plan.healthTargets.sleepNights} nights logged`} tone={plan.healthTargets.sleepNights < 3 ? "warning" : undefined} />
            <PlanTile icon={<CreditCard size={16} />} label="Bills due" value={plan.financeTargets.billsDueThisWeek + plan.financeTargets.overdueBills} detail={`${formatMoney(plan.financeTargets.weekSpend)} spent`} tone={plan.financeTargets.overdueBills ? "danger" : plan.financeTargets.billsDueThisWeek ? "warning" : undefined} />
            <PlanTile icon={<Repeat2 size={16} />} label="Habits behind" value={plan.habitTargets.behind} detail={`${plan.habitTargets.complete}/${plan.habitTargets.active} complete`} tone={plan.habitTargets.behind ? "warning" : "success"} />
            <PlanTile icon={<Flag size={16} />} label="Goal deadlines" value={plan.goalTargets.dueThisWeek} detail={`${plan.goalTargets.averageProgress}% avg progress`} tone={plan.goalTargets.dueThisWeek ? "warning" : undefined} />
          </div>

          <ModuleCard title="Week execution map" kicker="A day-by-day view of where the plan actually lands.">
            <div className="flex flex-col gap-2">
              {agendaDays.map((day) => (
                <article key={day.date} className="rounded-tile border border-hairline bg-surface p-3" aria-label={`${day.label}: ${day.summary}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{day.label}</p>
                      <p className="text-[12.5px] text-ink-muted">{day.summary}</p>
                    </div>
                    <Badge tone={agendaTone(day.load)}>{agendaLoadLabel(day.load)}</Badge>
                  </div>
                  {day.events.length ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {day.events.map((event) => (
                        <Link key={event.id} href={event.href} className="flex flex-col rounded-lg px-2 py-1 transition-colors hover:bg-surface-inset">
                          <span className="text-[13px] font-medium text-ink">{event.title}</span>
                          <span className="text-[12px] text-ink-muted">
                            {formatTime(event.at)} · {event.detail}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[12.5px] text-ink-muted">Keep this as buffer or schedule the next important block.</p>
                  )}
                  {day.hiddenCount ? (
                    <Link href="/calendar" className="mt-2 inline-block text-[12px] font-semibold text-accent-deep">
                      +{day.hiddenCount} more in Calendar
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </ModuleCard>

          <div className="flex flex-col gap-4">
            <ModuleCard title="Recommended actions" kicker="Highest-leverage moves from your current data.">
              {plan.actions.length ? (
                <div className="flex flex-col gap-1.5">
                  {plan.actions.map((action) => (
                    <ListRow
                      key={action.id}
                      href={action.href}
                      title={action.title}
                      subtitle={action.detail}
                      trailing={<Badge tone={actionTone(action.tone)}>{action.tone === "neutral" ? "plan" : action.tone}</Badge>}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>No planning actions found.</EmptyState>
              )}
            </ModuleCard>

            <ModuleCard title="Next scheduled items" kicker="The next 7 days across Orbit.">
              {upcomingEvents.length ? (
                <div className="flex flex-col gap-1.5">
                  {upcomingEvents.map((event) => (
                    <ListRow
                      key={event.id}
                      href={event.href}
                      title={event.title}
                      subtitle={`${formatShortDate(event.at)} ${formatTime(event.at)} · ${event.detail}`}
                      trailing={<Badge tone={eventKindTone(event.kind)}>{event.kind}</Badge>}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>No dated work, logs, or goals in the next week.</EmptyState>
              )}
            </ModuleCard>

            <OnboardingPanel data={data} />

            <ModuleCard title="Workload" kicker={`${plan.taskLoad.highPriority} high-priority open task${plan.taskLoad.highPriority === 1 ? "" : "s"}.`}>
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Overdue tasks" value={plan.taskLoad.overdue} tone={plan.taskLoad.overdue ? "danger" : "success"} />
                <PlanMetric label="Due this week" value={plan.taskLoad.dueThisWeek} />
                <PlanMetric label="High priority" value={plan.taskLoad.highPriority} tone={plan.taskLoad.highPriority ? "warning" : undefined} />
              </div>
            </ModuleCard>

            <ModuleCard title="Focus plan" kicker="Execution time connected to tasks.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Completed focus" value={formatFocusDuration(plan.focusTargets.weekMinutes)} detail={`${plan.focusTargets.sessionsLogged} sessions logged`} />
                <PlanMetric label="Planned blocks" value={plan.focusTargets.plannedThisWeek} tone={plan.focusTargets.plannedThisWeek ? "success" : undefined} />
                <PlanMetric label="Missed blocks" value={plan.focusTargets.overduePlanned} tone={plan.focusTargets.overduePlanned ? "warning" : undefined} />
              </div>
            </ModuleCard>

            <ModuleCard title="Food plan" kicker="Meals and groceries before the week starts.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Meals this week" value={plan.foodTargets.plannedThisWeek} detail={`${plan.foodTargets.todayPlannedMeals} planned today`} tone={plan.foodTargets.plannedThisWeek ? "success" : undefined} />
                <PlanMetric label="Planned calories" value={plan.foodTargets.todayPlannedCalories} detail="Today’s planned food" />
                <PlanMetric label="Groceries needed" value={plan.foodTargets.groceriesNeeded} detail={`${plan.foodTargets.groceriesDue} due soon`} tone={plan.foodTargets.groceriesDue ? "warning" : undefined} />
              </div>
            </ModuleCard>

            <ModuleCard title="People plan" kicker="Birthdays and follow-ups.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="People tracked" value={plan.peopleTargets.total} />
                <PlanMetric label="Follow-ups due" value={plan.peopleTargets.dueFollowUps} detail={`${plan.peopleTargets.overdueFollowUps} overdue`} tone={plan.peopleTargets.overdueFollowUps ? "warning" : undefined} />
                <PlanMetric label="Birthdays" value={plan.peopleTargets.upcomingBirthdays} detail="Next 30 days" />
              </div>
            </ModuleCard>

            <ModuleCard title="Health targets" kicker="Compared with your saved preferences.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Average calories" value={plan.healthTargets.calorieAverage} detail={calorieDetail(plan.healthTargets.caloriesTarget, plan.healthTargets.calorieDelta)} />
                <PlanMetric label="Workout minutes" value={`${plan.healthTargets.workoutMinutes}/${plan.healthTargets.workoutTarget}`} tone={plan.healthTargets.workoutRemaining ? "warning" : "success"} />
                <PlanMetric label="Average sleep" value={formatSleepDuration(plan.healthTargets.sleepAverageMinutes)} detail={`${plan.healthTargets.sleepNights} nights logged`} tone={plan.healthTargets.sleepNights < 3 ? "warning" : undefined} />
              </div>
            </ModuleCard>

            <ModuleCard title="Money plan" kicker="Spending and active bill pressure.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Spent this week" value={formatMoney(plan.financeTargets.weekSpend)} detail={`${plan.financeTargets.expensesLogged} expenses logged`} />
                <PlanMetric label="Bills due" value={plan.financeTargets.billsDueThisWeek + plan.financeTargets.overdueBills} tone={plan.financeTargets.overdueBills ? "danger" : plan.financeTargets.billsDueThisWeek ? "warning" : undefined} />
                <PlanMetric label="Monthly commitments" value={formatMoney(plan.financeTargets.monthlyCommitments)} />
              </div>
            </ModuleCard>

            <ModuleCard title="Review coverage" kicker="Signals that make planning better.">
              <div className="flex flex-col gap-1.5">
                <PlanMetric label="Captures saved" value={plan.review.capturesSaved} />
                <PlanMetric label="Journal entries" value={plan.review.journalEntries} tone={plan.review.journalEntries < 3 ? "warning" : "success"} />
                <PlanMetric label="Average mood" value={plan.review.averageMood ?? "none"} />
              </div>
            </ModuleCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanTile({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string | number; detail: string; tone?: PlanTone }) {
  return <StatTile icon={icon} label={label} value={value} hint={detail} tone={tone === "danger" || tone === "warning" ? "urgent" : tone === "success" ? "success" : "neutral"} />;
}

function PlanMetric({ label, value, detail, tone }: { label: string; value: string | number; detail?: string; tone?: PlanTone }) {
  return <ListRow title={value} subtitle={detail ?? label} trailing={<Badge tone={planTone(tone)}>{label}</Badge>} />;
}

function planTone(tone?: PlanTone): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}

function actionTone(tone: PlanActionTone): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}

function agendaTone(load: PlanAgendaLoad): BadgeTone {
  if (load === "heavy") return "urgent";
  if (load === "full") return "warning";
  if (load === "light") return "success";
  return "neutral";
}

function agendaLoadLabel(load: PlanAgendaLoad) {
  if (load === "open") return "open";
  if (load === "light") return "light";
  if (load === "full") return "full";
  return "heavy";
}

function eventKindTone(kind: string): BadgeTone {
  if (kind === "reminder" || kind === "bill" || kind === "grocery" || kind === "person") return "warning";
  if (kind === "workout" || kind === "focus" || kind === "mealPlan") return "success";
  return "neutral";
}

function calorieDetail(target: number | null, delta: number | null) {
  if (target === null || delta === null) return "No daily target set";
  if (delta === 0) return `On ${target} target`;
  return `${Math.abs(delta)} ${delta > 0 ? "above" : "below"} ${target} target`;
}
