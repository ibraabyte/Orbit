import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, CardLink, EmptyState, Hero, Icon, IconTile, ListRow, Metric, RingGauge, StatGrid, StatTile, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { ErrorState, HeaderButton, OfflineBanner, openCapture, Screen, Skeleton, TabHeader } from "@/components/screen";
import { TaskRow } from "@/components/task-row";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { appHref } from "@/lib/app-href";
import { buildCalendarDays } from "@/lib/calendar";
import { buildDailyBrief, overdueTasks, summarizeDashboard, todaysTasks } from "@/lib/dashboard";
import { isToday } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { formatFocusDuration } from "@/lib/focus";
import { foodSummary } from "@/lib/food";
import { captureStarters, formatClock, formatDate, formatIn, isArabic, t } from "@/lib/i18n";
import { peopleSummary } from "@/lib/people";
import { formatSleepDuration } from "@/lib/sleep";

const prayerNames: Record<string, string> = { الفجر: "Fajr", الظهر: "Dhuhr", العصر: "Asr", المغرب: "Maghrib", العشاء: "Isha" };

const hiddenKey = "orbit.today.hidden";
const optional = [
  ["digest", t.digest],
  ["quick", t.quick],
  ["next", t.nextUp],
  ["health", t.healthToday]
] as const;
type OptionalSection = (typeof optional)[number][0];

// Today = now: prayer, digest, today's counts, attention, capture, next up, health today.
// The week's rollup and trends live in Plan, so each number has one home.
export default function Today() {
  const { data, loading, error, refresh } = useDashboardData();
  const { next: prayer } = usePrayerTimes();
  const { sheet } = useOverlays();
  const [hidden, setHidden] = useState<OptionalSection[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(hiddenKey)
      .then((saved) => saved && setHidden(JSON.parse(saved)))
      .catch(() => undefined);
  }, []);

  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const brief = useMemo(() => buildDailyBrief(data).slice(0, 5), [data]);
  const food = useMemo(() => foodSummary(data), [data]);
  const people = useMemo(() => peopleSummary(data), [data]);
  const upcoming = useMemo(() => {
    const now = Date.now();
    return buildCalendarDays(data, 7).flatMap((day) => day.events).filter((event) => new Date(event.at).getTime() >= now).slice(0, 4);
  }, [data]);
  const attention = useMemo(() => {
    const seen = new Set<string>();
    return [...overdueTasks(data.tasks), ...todaysTasks(data.tasks)].filter((task) => !seen.has(task.id) && seen.add(task.id)).slice(0, 6);
  }, [data.tasks]);

  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const calorieShare = calorieTarget ? Math.min(1, summary.todayCalories / calorieTarget) : 0;
  const hasData = data.profile !== null || data.tasks.length > 0;
  const show = (section: OptionalSection) => !hidden.includes(section);

  const customize = () =>
    sheet({
      title: t.customize,
      options: optional.map(([id, label]) => ({
        label: `${show(id) ? "●" : "○"} ${label}`,
        run: () => {
          const next = show(id) ? [...hidden, id] : hidden.filter((item) => item !== id);
          setHidden(next);
          void AsyncStorage.setItem(hiddenKey, JSON.stringify(next)).catch(() => undefined);
        }
      }))
    });

  const header = <TabHeader kicker={formatDate(new Date(), { weekday: "long", day: "numeric", month: "short" })} title={t.today} action={<HeaderButton icon="sliders" label={t.customize} onPress={customize} />} />;

  if (!hasData) {
    return (
      <Screen header={header} refreshing={loading} onRefresh={refresh}>
        {loading ? <Skeleton /> : <ErrorState detail={error} onRetry={refresh} />}
      </Screen>
    );
  }

  return (
    <Screen header={header} banner={error ? <OfflineBanner message={t.offline} /> : undefined} refreshing={loading} onRefresh={refresh}>
      {prayer ? (
        <Hero style={{ gap: 14, paddingVertical: 14 }}>
          <View style={styles.prayerMark}>
            <Icon name="moon" size={20} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.tileLabel, { fontSize: 12, color: colors.accentMuted }]}>{t.nextPrayer}</Text>
            <Text style={[type.h2, { color: colors.accentInk }]}>
              {isArabic ? prayer.label : (prayerNames[prayer.label] ?? prayer.label)} · {formatClock(prayer.at)}
            </Text>
          </View>
          <Text style={[type.barValue, { color: colors.accentInk }]}>{formatIn(Math.max(0, Math.round((prayer.at.getTime() - Date.now()) / 60_000)))}</Text>
        </Hero>
      ) : null}

      {show("digest") ? (
        <Card title={t.digest} action={<Badge>{brief.length}</Badge>}>
          {brief.length ? (
            brief.map((item) => (
              <ListRow
                key={item.id}
                href={appHref(item.href)}
                leading={<IconTile name={digestIcon(item.tone)} size={28} tone={item.tone === "danger" ? "urgent" : item.tone === "warning" ? "accent" : "neutral"} />}
                title={item.title}
                subtitle={item.detail}
              />
            ))
          ) : (
            <EmptyState example="call mom tomorrow 9am">{t.emptyEx}</EmptyState>
          )}
        </Card>
      ) : null}

      {show("quick") ? (
        <StatGrid>
          {[
            <StatTile key="tasks" href="/tasks" label={t.openTasks} value={summary.openTaskCount} alert={summary.overdueTaskCount > 0} />,
            <StatTile key="reminders" href="/tasks" label={t.dueReminders} value={summary.dueReminderCount} alert={summary.dueReminderCount > 0} />,
            <StatTile key="focus" href="/focus" label={t.focus} value={formatFocusDuration(summary.todayFocusMinutes)} />,
            <StatTile key="meals" href="/food" label={t.mealsPlanned} value={food.todayPlannedMeals} />,
            <StatTile key="follow" href="/people" label={t.followUps} value={people.dueFollowUps.length} alert={people.overdueFollowUps.length > 0} />,
            <StatTile key="spent" href="/finance" label={t.spentToday} value={formatMoney(summary.todaySpending, currency)} />,
            <StatTile key="goals" href="/goals" label={t.activeGoals} value={summary.activeGoalCount} />,
            <StatTile key="habits" href="/habits" label={t.habitsDone} value={`${summary.completedHabitCount}/${summary.activeHabitCount}`} />
          ]}
        </StatGrid>
      ) : null}

      <Card title={t.attention} action={<CardLink href="/tasks" label={t.tasks} />}>
        {attention.length ? attention.map((task) => <TaskRow key={task.id} task={task} />) : <EmptyState example="call mom tomorrow 9am">{t.emptyEx}</EmptyState>}
      </Card>

      <Card title={t.captureTitle}>
        <Pressable onPress={() => openCapture()} accessibilityRole="button" accessibilityLabel={t.capture} style={styles.captureBar}>
          <View style={styles.captureMark}>
            <Icon name="plus" size={16} color={colors.accentInk} />
          </View>
          <Text style={styles.capturePlaceholder} numberOfLines={1}>
            {t.capturePh}
          </Text>
        </Pressable>
        <View style={styles.starters}>
          {captureStarters.map((word) => (
            <Pressable key={word} onPress={() => openCapture(word)} accessibilityRole="button" style={styles.starter}>
              <Text style={[type.pill, { color: colors.ink }]}>{word.trim()}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {show("next") ? (
        <Card title={t.nextUp} action={<CardLink href="/plan" label={t.plan} />}>
          {upcoming.length ? (
            upcoming.map((event) => (
              <ListRow
                key={event.id}
                href={appHref(event.href)}
                leading={<Text style={styles.nextTime}>{isToday(event.at) ? formatClock(event.at) : formatDate(event.at, { weekday: "short", hour: "numeric" })}</Text>}
                title={event.title}
                subtitle={event.detail}
              />
            ))
          ) : (
            <EmptyState example="focus 50m AWS @4pm">{t.emptyEx}</EmptyState>
          )}
        </Card>
      ) : null}

      {show("health") ? (
        <Card title={t.healthToday} action={<CardLink href="/health" label={t.health} />}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <RingGauge value={calorieShare} label={calorieTarget ? `${Math.round(calorieShare * 100)}%` : "–"} />
            <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Metric label={t.calories} value={summary.todayCalories} unit={calorieTarget ? `/ ${calorieTarget}` : undefined} />
              </View>
              <View style={{ flex: 1 }}>
                <Metric label={t.workouts} value={summary.todayWorkoutMinutes} unit={t.min} />
              </View>
              <View style={{ flex: 1 }}>
                <Metric label={t.sleep} value={formatSleepDuration(summary.todaySleepMinutes)} />
              </View>
            </View>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

function digestIcon(tone?: string | null) {
  if (tone === "danger") return "alert-circle" as const;
  if (tone === "warning") return "alert-triangle" as const;
  return "arrow-right" as const;
}

const styles = StyleSheet.create({
  prayerMark: { width: 40, height: 40, borderRadius: radius.tile, backgroundColor: "rgba(0,0,0,0.08)", alignItems: "center", justifyContent: "center" },
  captureBar: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.shell, borderRadius: radius.tile },
  captureMark: { width: 24, height: 24, borderRadius: radius.chip, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  capturePlaceholder: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.inkFaint },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  starter: { minHeight: 32, paddingHorizontal: 10, justifyContent: "center", borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.control, backgroundColor: colors.surface },
  nextTime: { width: 64, fontFamily: fonts.bold, fontSize: 12, color: colors.inkMuted }
});

