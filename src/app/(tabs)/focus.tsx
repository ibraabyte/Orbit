import { Text } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section, Stats, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { focusMinutesByDay, focusSummary, formatFocusDuration } from "@/lib/focus";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import type { FocusSession } from "@/lib/types";

// Focus + the old Momentum page (its stats live in "This week").
export default function Focus() {
  const { data, loading, refresh, act } = useDashboardData();
  const summary = focusSummary(data);
  const week = focusMinutesByDay(data, 7);
  const best = week.reduce((top, day) => (day.value > top.value ? day : top), week[0]);
  const planned = [...summary.plannedOverdue, ...summary.plannedUpcoming];
  const recent = data.focusSessions.filter((session) => session.status === "completed").slice(0, 8);

  const finish = (session: FocusSession) =>
    act(() => apiUpdate(getApi(), "/focus-sessions", session.id, { status: "completed", ended_at: new Date().toISOString() }));

  return (
    <Screen title="Focus" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      <Section title="This week">
        <Stats
          items={[
            ["Today", formatFocusDuration(summary.todayMinutes)],
            ["7 days", formatFocusDuration(summary.weekMinutes)],
            ["Sessions", summary.sessionsLogged],
            ["Energy", summary.averageEnergy ? `${summary.averageEnergy}/5` : "-"],
            ["Best day", best?.value ? best.label : "-"],
            ["Best min", best?.value ?? 0]
          ]}
        />
      </Section>
      <Section title="Planned">
        {planned.length ? (
          planned.map((session) => (
            <Row
              key={session.id}
              title={session.title}
              detail={`${new Date(session.started_at).toLocaleString()} · ${session.duration_minutes} min`}
              tone={summary.plannedOverdue.includes(session) ? "warning" : "neutral"}
              right="Done"
              onPress={() => finish(session)}
            />
          ))
        ) : (
          <Empty>No planned blocks. Try "focus 45m deep work @tomorrow".</Empty>
        )}
      </Section>
      <Section title="Recent">
        {recent.length ? recent.map((session) => <Row key={session.id} title={session.title} detail={new Date(session.started_at).toLocaleDateString()} right={`${session.duration_minutes}m`} />) : <Empty>Nothing logged yet.</Empty>}
      </Section>
    </Screen>
  );
}
