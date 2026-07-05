"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Segmented } from "@/components/ui/segmented";
import { RingGauge } from "@/components/ui/ring-gauge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { useAuth } from "@/components/auth-provider";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { averageFocusEnergy, completedFocusMinutes, focusMinutesByDay, focusSessionsInLastDays, formatFocusDuration } from "@/lib/focus";

type RangeValue = "daily" | "weekly" | "monthly";

const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
];

function rangeDays(range: RangeValue) {
  if (range === "weekly") return 28;
  if (range === "monthly") return 84;
  return 7;
}

export function MomentumPage() {
  const { user } = useAuth();
  const { data, loading, error } = useDashboardData(user?.id);
  const [range, setRange] = useState<RangeValue>("daily");
  const days = rangeDays(range);

  const stats = useMemo(() => {
    if (!data) return null;
    const windowSessions = focusSessionsInLastDays(data.focusSessions, days);
    const completed = windowSessions.filter((session) => session.status === "completed");
    const trend = focusMinutesByDay(data, days);
    const bestDay = trend.reduce<(typeof trend)[number] | null>((best, day) => (best && best.value >= day.value ? best : day), null);
    return {
      minutes: completedFocusMinutes(windowSessions),
      sessions: completed.length,
      total: windowSessions.length,
      completionRate: windowSessions.length ? completed.length / windowSessions.length : 0,
      energy: averageFocusEnergy(windowSessions),
      trend,
      bestDay
    };
  }, [data, days]);

  const maxTrend = stats ? Math.max(1, ...stats.trend.map((day) => day.value)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Momentum" subtitle="Your focus over time" />

      {loading || !stats ? (
        <LoadingBlock />
      ) : error ? (
        <EmptyState title="Could not load momentum">{error}</EmptyState>
      ) : (
        <>
          <Segmented ariaLabel="Time range" options={RANGE_OPTIONS} value={range} onChange={setRange} />

          <Card>
            <div className="flex items-center gap-4">
              <RingGauge
                value={stats.completionRate}
                label={`${Math.round(stats.completionRate * 100)}%`}
                sublabel="Done"
                tone="accent"
                ariaLabel={`${Math.round(stats.completionRate * 100)} percent of focus sessions completed`}
              />
              <div className="min-w-0">
                <div className="text-ink" style={{ font: "var(--text-h2)" }}>
                  {formatFocusDuration(stats.minutes)}
                </div>
                <p className="text-[13px] text-ink-muted">
                  focused across {stats.sessions} completed session{stats.sessions === 1 ? "" : "s"}
                </p>
                {stats.bestDay && stats.bestDay.value > 0 ? (
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Best day: {stats.bestDay.date} · {formatFocusDuration(stats.bestDay.value)}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Sessions" value={stats.total} hint={`${stats.sessions} completed`} />
            <StatTile label="Avg energy" value={stats.energy ?? "–"} tone="accent" />
          </div>

          <Card title="Focus trend" kicker="Completed focus minutes per day.">
            {stats.minutes === 0 ? (
              <EmptyState title="No focus logged yet">Complete a focus session to see momentum build.</EmptyState>
            ) : (
              <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`Focus minutes over the last ${days} days`}>
                {stats.trend.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 rounded-t-[3px] bg-accent-deep/70"
                    style={{ height: `${Math.max(4, (day.value / maxTrend) * 100)}%` }}
                    title={`${day.date}: ${day.value}m`}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
