import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, CheckItem, EmptyState, Hero, IconTile, ListRow, Metric, RingGauge, StatGrid, StatTile, TrendBars, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Screen, Segments, TabHeader } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { averageFocusEnergy, completedFocusMinutes, focusMinutesByDay, focusSessionsInLastDays, focusSummary, formatFocusDuration } from "@/lib/focus";
import { formatDate, t } from "@/lib/i18n";
import type { FocusSession } from "@/lib/types";

const ranges = { day: 1, week: 7, month: 30 } as const;
type Range = keyof typeof ranges;

// Momentum: focus over a day, week or month, the planned blocks, and recent sessions.
export default function Momentum() {
  const { data, loading, refresh, act } = useDashboardData();
  const { toast } = useOverlays();
  const [range, setRange] = useState<Range>("week");
  const days = ranges[range];

  const stats = useMemo(() => {
    const windowSessions = focusSessionsInLastDays(data.focusSessions, days);
    const completed = windowSessions.filter((session) => session.status === "completed");
    const trend = focusMinutesByDay(data, Math.max(days, 7));
    const bestDay = trend.reduce<(typeof trend)[number] | null>((best, day) => (best && best.value >= day.value ? best : day), null);
    return {
      minutes: completedFocusMinutes(windowSessions),
      sessions: completed.length,
      completionRate: windowSessions.length ? completed.length / windowSessions.length : 0,
      energy: averageFocusEnergy(windowSessions),
      trend,
      bestDay
    };
  }, [data, days]);

  const summary = focusSummary(data);
  const planned = [...summary.plannedOverdue, ...summary.plannedUpcoming];
  const recent = data.focusSessions.filter((session) => session.status === "completed").slice(0, 8);
  const finish = (session: FocusSession) => act(() => apiUpdate(getApi(), "/focus-sessions", session.id, { status: "completed", ended_at: new Date().toISOString() })).then(() => toast(t.done));
  const percent = Math.round(stats.completionRate * 100);
  const shortTrend = stats.trend.length <= 7;

  return (
    <Screen
      header={<TabHeader title={t.momentum} action={<Segments small options={Object.keys(ranges) as Range[]} value={range} onChange={setRange} labels={{ day: t.day, week: t.week, month: t.month }} />} />}
      refreshing={loading}
      onRefresh={refresh}
    >
      <Hero>
        <RingGauge value={stats.completionRate} size={92} thickness={10} label={`${percent}%`} sublabel={t.completion} color={colors.accentInk} track="rgba(0,0,0,0.14)" hole={colors.accent} labelColor={colors.accentInk} />
        <View style={{ flex: 1, gap: 8 }}>
          <Metric onLime label={t.totalFocus} value={formatFocusDuration(stats.minutes)} />
          <Metric onLime label={t.bestDay} value={stats.bestDay && stats.bestDay.value > 0 ? `${stats.bestDay.label} · ${formatFocusDuration(stats.bestDay.value)}` : "–"} />
        </View>
      </Hero>

      <StatGrid columns={2}>
        {[
          <StatTile key="sessions" label={t.sessions} value={stats.sessions} size={22} />,
          <StatTile key="energy" label={t.avgEnergy} value={stats.energy ?? "–"} unit={stats.energy ? "/ 5" : undefined} size={22} />
        ]}
      </StatGrid>

      <Card title={t.trend}>
        <TrendBars values={stats.trend.map((day) => day.value)} labels={shortTrend ? stats.trend.map((day) => day.label.slice(0, 3)) : undefined} gap={shortTrend ? 6 : 2} label={t.trend} highlight={stats.trend.length - 1} />
      </Card>

      <Card title={t.planned}>
        {planned.length ? (
          planned.map((session) => {
            const missed = summary.plannedOverdue.includes(session);
            return (
              <ListRow
                key={session.id}
                leading={<CheckItem checked={false} ring={missed ? colors.urgent : colors.ink} label={`${t.finish}: ${session.title}`} onPress={() => finish(session)} />}
                title={session.title}
                badges={missed ? <Badge tone="urgent" glyph="!">{t.missed}</Badge> : <Badge glyph="◷">{t.planned}</Badge>}
                subtitle={`${formatDate(session.started_at, { weekday: "short", hour: "numeric", minute: "2-digit" })} · ${session.duration_minutes} ${t.min}`}
              />
            );
          })
        ) : (
          <EmptyState example="focus 50m AWS course @4pm">{t.emptyEx}</EmptyState>
        )}
      </Card>

      <Card title={t.recentSessions}>
        {recent.length ? (
          recent.map((session) => (
            <ListRow
              key={session.id}
              leading={
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" }}>
                  <Text style={[type.barValue, { fontSize: 12 }]}>{session.duration_minutes}′</Text>
                </View>
              }
              title={session.title}
              subtitle={formatDate(session.started_at, { weekday: "short", day: "numeric", month: "short" })}
              trailing={session.energy ? <Text style={[type.tileLabel, { fontSize: 12 }]}>⚡ {session.energy}/5</Text> : undefined}
            />
          ))
        ) : (
          <EmptyState>{t.emptyEx}</EmptyState>
        )}
      </Card>
    </Screen>
  );
}
