"use client";

import { Activity, Bed, CreditCard, Flame, ReceiptText, Scale, Smile, Target, Timer, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { LoadingBlock } from "@/components/loading-block";
import { ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list-row";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { caloriesByDay, habitCheckInsByDay, insightSummary, journalMoodByDay, workoutMinutesByDay, type DailyMetric } from "@/lib/insights";
import { financeSummary, formatMoney, spendingByDay } from "@/lib/finance";
import { plannedCaloriesByDay } from "@/lib/food";
import { focusMinutesByDay, formatFocusDuration } from "@/lib/focus";
import { formatSleepDuration, sleepByDay } from "@/lib/sleep";

export function InsightsPage() {
  const { user } = useAuth();
  const { data, loading, error } = useDashboardData(user?.id);
  if (!user) return null;

  const summary = insightSummary(data);
  const finance = financeSummary(data);
  const calories = caloriesByDay(data);
  const plannedCalories = plannedCaloriesByDay(data);
  const workouts = workoutMinutesByDay(data);
  const focus = focusMinutesByDay(data);
  const spending = spendingByDay(data);
  const sleep = sleepByDay(data);
  const habits = habitCheckInsByDay(data);
  const moods = journalMoodByDay(data);
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const weeklyWorkoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Insights" subtitle="Understand trends across health, money, routines, goals, and mood." />
      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {!loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <InsightTile
              icon={<Flame size={16} />}
              label="Avg calories"
              value={summary.averageCalories}
              detail={calorieTarget ? `${Math.round((summary.averageCalories / calorieTarget) * 100)}% of ${calorieTarget} daily target` : "7-day daily average"}
            />
            <InsightTile
              icon={<Activity size={16} />}
              label="Workout minutes"
              value={summary.workoutMinutes}
              detail={weeklyWorkoutTarget ? `${Math.round((summary.workoutMinutes / weeklyWorkoutTarget) * 100)}% of weekly target` : "Last 7 days"}
            />
            <InsightTile icon={<ReceiptText size={16} />} label="Month spend" value={formatMoney(finance.monthSpend)} detail={`${finance.monthExpenseCount} expenses this month`} />
            <InsightTile
              icon={<CreditCard size={16} />}
              label="Bills due"
              value={finance.upcomingBills.length + finance.overdueBills.length}
              detail={`${formatMoney(finance.monthlyCommitments)} estimated monthly commitments`}
            />
            <InsightTile
              icon={<Bed size={16} />}
              label="Avg sleep"
              value={formatSleepDuration(summary.sleep.sevenDayAverageMinutes)}
              detail={`${summary.sleep.nightsLogged} nights · quality ${summary.sleep.sevenDayQuality ?? "-"}/5`}
            />
            <InsightTile
              icon={<Timer size={16} />}
              label="Focus"
              value={formatFocusDuration(summary.focus.weekMinutes)}
              detail={`${summary.focus.sessionsLogged} sessions · energy ${summary.focus.averageEnergy ?? "-"}/5`}
            />
            <InsightTile icon={<Target size={16} />} label="Goal progress" value={`${summary.goalProgressAverage}%`} detail="Active goals" />
            <InsightTile
              icon={<Scale size={16} />}
              label="Latest weight"
              value={summary.weight.latest ? `${summary.weight.latest} ${summary.weight.unit}` : "-"}
              detail={summary.weight.delta === null ? "Need 2 entries" : `${summary.weight.delta > 0 ? "+" : ""}${summary.weight.delta} since previous`}
            />
          </div>

          <div className="flex flex-col gap-4">
            <ModuleCard title="Calories" kicker="Daily totals from meal logs.">
              <MetricBars data={calories} suffix="" />
            </ModuleCard>
            <ModuleCard title="Planned calories" kicker="Daily totals from planned meals.">
              <MetricBars data={plannedCalories} suffix="" />
            </ModuleCard>
            <ModuleCard title="Workout minutes" kicker="Daily training volume.">
              <MetricBars data={workouts} suffix="m" />
            </ModuleCard>
            <ModuleCard title="Focus" kicker="Daily completed focus minutes.">
              <MetricBars data={focus} suffix="m" />
            </ModuleCard>
            <ModuleCard title="Spending" kicker="Daily expense totals.">
              <MetricBars data={spending} suffix="" />
            </ModuleCard>
            <ModuleCard title="Sleep" kicker="Daily sleep duration in minutes.">
              <MetricBars data={sleep} suffix="m" />
            </ModuleCard>
            <ModuleCard title="Routines" kicker={`${summary.habitCompletionRate}% habit completion now`}>
              <MetricBars data={habits} suffix="" />
            </ModuleCard>
            <ModuleCard title="Mood" kicker={`7-day average: ${summary.sevenDayMood ?? "none"}`}>
              <MetricBars data={moods} suffix="" max={5} />
            </ModuleCard>
            <ModuleCard title="Next actions" kicker="Useful places to update the source data.">
              <div className="flex flex-col gap-1.5">
                <ListRow href="/health" title="Add health logs" subtitle="Meals, weight, and workouts power the health trends." trailing={<Badge>health</Badge>} />
                <ListRow
                  href="/food"
                  title="Plan food"
                  subtitle="Planned meals and groceries show whether food is handled before the day starts."
                  trailing={
                    <Badge>
                      <Utensils size={13} aria-hidden="true" />
                      food
                    </Badge>
                  }
                />
                <ListRow
                  href="/journal"
                  title="Write today’s journal"
                  subtitle="Mood trends need consistent entries."
                  trailing={
                    <Badge>
                      <Smile size={13} aria-hidden="true" />
                      mood
                    </Badge>
                  }
                />
                <ListRow
                  href="/health"
                  title="Log recovery"
                  subtitle="Sleep trends make health and planning signals more useful."
                  trailing={
                    <Badge>
                      <Bed size={13} aria-hidden="true" />
                      sleep
                    </Badge>
                  }
                />
                <ListRow
                  href="/focus"
                  title="Plan focus blocks"
                  subtitle="Focus sessions connect tasks and goals to actual execution time."
                  trailing={
                    <Badge>
                      <Timer size={13} aria-hidden="true" />
                      focus
                    </Badge>
                  }
                />
                <ListRow
                  href="/finance"
                  title="Review money logs"
                  subtitle="Expenses and recurring bills power the finance trends."
                  trailing={
                    <Badge>
                      <CreditCard size={13} aria-hidden="true" />
                      money
                    </Badge>
                  }
                />
              </div>
            </ModuleCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InsightTile({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  return <StatTile icon={icon} label={label} value={value} hint={detail} />;
}

function MetricBars({ data, suffix, max }: { data: DailyMetric[]; suffix: string; max?: number }) {
  const peak = max ?? Math.max(1, ...data.map((day) => day.value));

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Trend chart">
      {data.map((day) => {
        const heightPct = Math.min(100, Math.max(4, Math.round((day.value / peak) * 100)));
        return (
          <div className="flex flex-1 flex-col items-center gap-1" key={day.date}>
            <div className="text-[10px] font-semibold tabular-nums text-ink-muted">
              {day.value}
              {suffix}
            </div>
            <div className="flex h-24 w-full items-end">
              <div className="w-full rounded-t-[3px] bg-accent-deep/70" style={{ height: `${heightPct}%` }} />
            </div>
            <div className="text-[10px] text-ink-muted">{day.label}</div>
          </div>
        );
      })}
    </div>
  );
}
