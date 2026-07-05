"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildCalendarDays, calendarEventCounts, type CalendarEventKind } from "@/lib/calendar";
import { formatTime } from "@/lib/dates";
import { downloadIcsCalendar } from "@/lib/ics";

const kindLabels: Record<CalendarEventKind, string> = {
  task: "Tasks",
  reminder: "Reminders",
  meal: "Meals",
  mealPlan: "Planned meals",
  grocery: "Groceries",
  person: "People",
  workout: "Workouts",
  weight: "Weight",
  sleep: "Sleep",
  focus: "Focus",
  expense: "Expenses",
  bill: "Bills",
  journal: "Journal",
  goal: "Goals"
};

export function CalendarPage() {
  const { user } = useAuth();
  const { data, loading, error } = useDashboardData(user?.id);
  const days = useMemo(() => buildCalendarDays(data, 14), [data]);
  const counts = useMemo(() => calendarEventCounts(days), [days]);
  const visibleEvents = useMemo(() => days.flatMap((day) => day.events), [days]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Calendar" subtitle="A two-week agenda across tasks, focus, reminders, people, food, health, recovery, finance, journal, and goals.">
        <Button
          size="sm"
          type="button"
          disabled={!visibleEvents.length}
          onClick={() => downloadIcsCalendar(`orbit-agenda-${new Date().toISOString().slice(0, 10)}.ics`, visibleEvents)}
        >
          <Download size={15} aria-hidden="true" />
          Export .ics
        </Button>
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
            {Object.entries(counts).map(([kind, count]) => (
              <StatTile key={kind} label={kindLabels[kind as CalendarEventKind]} value={count} hint="next 14 days" tone={count ? "accent" : "neutral"} />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {days.map((day) => (
              <ModuleCard key={day.date} title={day.label} kicker={`${day.events.length} event${day.events.length === 1 ? "" : "s"}`}>
                {day.events.length ? (
                  <div className="flex flex-col gap-1.5">
                    {day.events.map((event) => (
                      <ListRow
                        key={event.id}
                        href={event.href}
                        title={event.title}
                        subtitle={`${formatTime(event.at)} · ${event.detail}`}
                        trailing={<Badge tone={eventKindTone(event.kind)}>{event.kind}</Badge>}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState>No scheduled items.</EmptyState>
                )}
              </ModuleCard>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function eventKindTone(kind: CalendarEventKind): BadgeTone {
  if (kind === "reminder" || kind === "bill" || kind === "grocery" || kind === "person") return "warning";
  if (kind === "workout" || kind === "sleep" || kind === "focus" || kind === "mealPlan") return "success";
  return "neutral";
}
