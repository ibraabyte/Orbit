import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Card, CheckItem, EmptyState, ListRow, RingGauge, Stack, StatGrid, StatTile, TrendBars, type } from "@/components/drift";
import { Screen, Segments } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { averageFocusEnergy, completedFocusMinutes, focusMinutesByDay, focusSessionsInLastDays, focusSummary, formatFocusDuration } from "@/lib/focus";
import type { FocusSession } from "@/lib/types";

const ranges = { Daily: 7, Weekly: 28, Monthly: 84 } as const;
type Range = keyof typeof ranges;

// The web version's Momentum tab (focus over time), plus the planned and recent focus blocks.
export default function Momentum() {
  const { data, loading, refresh, act } = useDashboardData();
  const [range, setRange] = useState<Range>("Daily");
  const days = ranges[range];

  const stats = useMemo(() => {
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

  const summary = focusSummary(data);
  const planned = [...summary.plannedOverdue, ...summary.plannedUpcoming];
  const recent = data.focusSessions.filter((session) => session.status === "completed").slice(0, 8);
  const finish = (session: FocusSession) => act(() => apiUpdate(getApi(), "/focus-sessions", session.id, { status: "completed", ended_at: new Date().toISOString() }));
  const percent = Math.round(stats.completionRate * 100);

  return (
    <Screen title="Momentum" subtitle="Your focus over time" refreshing={loading} onRefresh={refresh}>
      <Segments options={Object.keys(ranges) as Range[]} value={range} onChange={setRange} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <RingGauge value={stats.completionRate} label={`${percent}%`} sublabel="Done" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.h2}>{formatFocusDuration(stats.minutes)}</Text>
            <Text style={type.meta}>
              focused across {stats.sessions} completed session{stats.sessions === 1 ? "" : "s"}
            </Text>
            {stats.bestDay && stats.bestDay.value > 0 ? (
              <Text style={type.hint}>
                Best day: {stats.bestDay.label} · {formatFocusDuration(stats.bestDay.value)}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <StatGrid>
        <StatTile label="Sessions" value={stats.total} hint={`${stats.sessions} completed`} icon="clock" />
        <StatTile label="Avg energy" value={stats.energy ?? "–"} tone="accent" icon="zap" />
      </StatGrid>

      <Card title="Focus trend" kicker="Completed focus minutes per day.">
        {stats.minutes === 0 ? (
          <EmptyState title="No focus logged yet">Complete a focus session to see momentum build.</EmptyState>
        ) : (
          <TrendBars values={stats.trend.map((day) => day.value)} label={`Focus minutes over the last ${days} days`} />
        )}
      </Card>

      <Card title="Planned" kicker='Tick a block when it is done. Add one: "focus 45m deep work @tomorrow".'>
        {planned.length ? (
          <Stack>
            {planned.map((session) => {
              const overdue = summary.plannedOverdue.includes(session);
              return (
                <ListRow
                  key={session.id}
                  leading={<CheckItem checked={false} label={`Mark ${session.title} done`} onPress={() => finish(session)} />}
                  title={session.title}
                  subtitle={`${new Date(session.started_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} · ${session.duration_minutes} min${overdue ? " · missed" : ""}`}
                />
              );
            })}
          </Stack>
        ) : (
          <EmptyState>No planned blocks.</EmptyState>
        )}
      </Card>

      <Card title="Recent" kicker="Your last completed sessions.">
        {recent.length ? (
          <Stack>
            {recent.map((session) => (
              <ListRow key={session.id} title={session.title} subtitle={new Date(session.started_at).toLocaleDateString()} meta={`${session.duration_minutes}m`} />
            ))}
          </Stack>
        ) : (
          <EmptyState>Nothing logged yet.</EmptyState>
        )}
      </Card>
    </Screen>
  );
}
