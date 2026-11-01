import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, CardLink, EmptyState, GoalBar, Hero, IconTile, ListRow, Metric, ProgressBar, RingGauge, TrendBars, type } from "@/components/drift";
import { BleedRow, Screen, Segments, TabHeader } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { appHref } from "@/lib/app-href";
import { buildCalendarDays } from "@/lib/calendar";
import { isToday } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { focusMinutesByDay, formatFocusDuration } from "@/lib/focus";
import { formatClock, formatDate, t } from "@/lib/i18n";
import { caloriesByDay, habitCheckInsByDay, insightSummary, journalMoodByDay, workoutMinutesByDay } from "@/lib/insights";
import { buildPlanAgenda, buildWeeklyPlan, type PlanAgendaLoad } from "@/lib/planning";
import { buildReviewSummary, type ReviewMode } from "@/lib/review";
import { formatSleepDuration } from "@/lib/sleep";

const views = ["week", "review", "trends"] as const;
const reviewModes: ReviewMode[] = ["morning", "evening", "weekly"];
const loads: Record<PlanAgendaLoad, [glyph: string, label: string]> = { open: ["▁", t.light], light: ["▁", t.light], full: ["▃", t.full], heavy: ["▇", t.heavy] };
// ponytail: the profile has no sleep target yet, so the bar uses the design's 7h 30m.
const SLEEP_GOAL_MINUTES = 450;

// Plan = this week and the review loop: week indicators, day map, trends.
export default function Plan() {
  const { data, loading, refresh } = useDashboardData();
  const [view, setView] = useState<(typeof views)[number]>("week");

  return (
    <Screen header={<TabHeader title={t.plan} />} refreshing={loading} onRefresh={refresh}>
      <Segments options={views} value={view} onChange={setView} labels={{ week: t.week, review: t.review, trends: t.trends }} />
      {view === "week" ? <Week /> : null}
      {view === "review" ? <Review /> : null}
      {view === "trends" ? <Trends /> : null}
    </Screen>
  );
}

function Week() {
  const { data } = useDashboardData();
  const [openDay, setOpenDay] = useState<string | null>(null);
  const plan = useMemo(() => buildWeeklyPlan(data), [data]);
  const agenda = useMemo(() => buildPlanAgenda(data), [data]);
  const upcoming = useMemo(() => buildCalendarDays(data, 7).flatMap((day) => day.events).slice(0, 8), [data]);
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const money = (amount: number) => formatMoney(amount, currency);
  const { taskLoad, healthTargets, foodTargets, financeTargets, peopleTargets, habitTargets, goalTargets, focusTargets, review } = plan;
  const billsDue = financeTargets.billsDueThisWeek + financeTargets.overdueBills;
  const workloadScore = Math.min(100, (taskLoad.dueThisWeek + taskLoad.overdue) * 10);

  const indicators: [string, string][] = [
    [t.tasks, `${taskLoad.dueThisWeek} · ${taskLoad.overdue} ${t.overdue}`],
    [t.focus, formatFocusDuration(focusTargets.weekMinutes)],
    [t.workouts, `${healthTargets.workoutRemaining} ${t.min}`],
    [t.meals, String(foodTargets.plannedThisWeek)],
    [t.groceries, String(foodTargets.groceriesNeeded)],
    [t.people, String(peopleTargets.dueFollowUps)],
    [t.sleep, formatSleepDuration(healthTargets.sleepAverageMinutes)],
    [t.bills, String(billsDue)],
    [t.habits, `${habitTargets.behind}`],
    [t.goals, String(goalTargets.dueThisWeek)]
  ];

  return (
    <>
      <BleedRow>
        {indicators.map(([label, value]) => (
          <View key={label} style={styles.indicator}>
            <Text style={type.tileLabel}>{label}</Text>
            <Text style={type.title}>{value}</Text>
          </View>
        ))}
      </BleedRow>

      <Card
        title={t.dayMap}
        action={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Text style={type.tileLabel}>▁ {t.light}</Text>
            <Text style={type.tileLabel}>▃ {t.full}</Text>
            <Text style={type.tileLabel}>▇ {t.heavy}</Text>
          </View>
        }
      >
        {agenda.map((day) => {
          const today = isToday(`${day.date}T12:00:00`);
          const open = openDay === day.date;
          const [glyph, label] = loads[day.load];
          return (
            <Pressable key={day.date} onPress={() => setOpenDay(open ? null : day.date)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.dayRow}>
              <View style={[styles.dayTile, today && { backgroundColor: colors.accent }]}>
                <Text style={[type.axis, today && { color: colors.accentInk }]}>{formatDate(`${day.date}T12:00:00`, { weekday: "short" })}</Text>
                <Text style={[type.title, { fontSize: 16 }, today && { color: colors.accentInk }]}>{formatDate(`${day.date}T12:00:00`, { day: "numeric" })}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.tileLabel}>
                  {glyph} {label} · {day.eventCount}
                </Text>
                {open ? (
                  day.events.map((event) => (
                    <Text key={event.id} style={styles.dayText}>
                      {formatClock(event.at)} · {event.title}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.dayText} numberOfLines={1}>
                    {day.events.map((event) => event.title).join(" · ") || day.summary}
                  </Text>
                )}
              </View>
              {day.hiddenCount ? <Text style={styles.moreCount}>+{day.hiddenCount}</Text> : null}
            </Pressable>
          );
        })}
      </Card>

      <Card title={t.recommended}>
        {plan.actions.length ? (
          plan.actions.map((action) => <ListRow key={action.id} href={appHref(action.href)} leading={<IconTile name="arrow-right" size={24} tone="accent" />} title={action.title} subtitle={action.detail} />)
        ) : (
          <EmptyState>{t.emptyEx}</EmptyState>
        )}
      </Card>

      <Card title={t.upcoming7}>
        {upcoming.length ? (
          upcoming.map((event) => <ListRow key={event.id} href={appHref(event.href)} leading={<Text style={styles.when}>{formatDate(event.at, { weekday: "short" })}</Text>} title={event.title} />)
        ) : (
          <EmptyState example="focus 50m AWS @4pm">{t.emptyEx}</EmptyState>
        )}
      </Card>

      <View style={styles.pair}>
        <Card title={t.workload} style={{ flex: 1 }}>
          <Text style={styles.big}>{workloadScore >= 70 ? t.heavy : workloadScore >= 30 ? t.full : t.light}</Text>
          <ProgressBar value={workloadScore} color={colors.ink} height={8} />
          <Text style={type.hint}>
            {taskLoad.dueThisWeek} {t.tasks} · {taskLoad.highPriority} {t.high} · {billsDue} {t.bills}
          </Text>
        </Card>
        <Card title={t.coverage} style={{ flex: 1 }}>
          <Pair label={t.savedItems} value={review.capturesSaved} />
          <Pair label={t.journal} value={`${review.journalEntries} / 7`} />
          <Pair label={t.mood7} value={review.averageMood ?? "–"} />
        </Card>
      </View>

      <Card title={t.healthGoals}>
        <GoalBar label={t.workouts} value={`${healthTargets.workoutMinutes} ${t.min}`} goal={`${healthTargets.workoutTarget} ${t.min}`} percent={healthTargets.workoutTarget ? (healthTargets.workoutMinutes / healthTargets.workoutTarget) * 100 : 0} />
        <GoalBar label={t.calories} value={String(healthTargets.calorieAverage)} goal={healthTargets.caloriesTarget ? String(healthTargets.caloriesTarget) : null} percent={healthTargets.caloriesTarget ? (healthTargets.calorieAverage / healthTargets.caloriesTarget) * 100 : 0} />
        <GoalBar label={t.sleep} value={formatSleepDuration(healthTargets.sleepAverageMinutes)} goal={formatSleepDuration(SLEEP_GOAL_MINUTES)} percent={(healthTargets.sleepAverageMinutes / SLEEP_GOAL_MINUTES) * 100} />
      </Card>

      <Card title={t.moneyPlan} action={<CardLink href="/finance" label={t.finance} />}>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Metric label={t.week} value={money(financeTargets.weekSpend)} />
          </View>
          <View style={{ flex: 1 }}>
            <Metric label={t.bills} value={billsDue} />
          </View>
          <View style={{ flex: 1 }}>
            <Metric label={t.monthlyBills} value={money(financeTargets.monthlyCommitments)} />
          </View>
        </View>
      </Card>
    </>
  );
}

function Review() {
  const { data } = useDashboardData();
  const [mode, setMode] = useState<ReviewMode>(new Date().getHours() < 12 ? "morning" : "evening");
  const review = useMemo(() => buildReviewSummary(data, mode), [data, mode]);
  return (
    <>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {reviewModes.map((option) => {
          const on = option === mode;
          return (
            <Pressable key={option} onPress={() => setMode(option)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.modeChip, on && { backgroundColor: colors.urgent, borderColor: colors.urgent }]}>
              <Text style={[type.pill, { fontSize: 13, color: on ? colors.urgentInk : colors.ink }]}>{t[option]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Hero>
        <RingGauge value={review.score / 100} size={88} thickness={10} label={`${review.score}%`} color={colors.accentInk} track="rgba(0,0,0,0.14)" hole={colors.accent} labelColor={colors.accentInk} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.tileLabel, { fontSize: 12, color: colors.accentMuted }]}>
            {t.readiness} · {t[mode]}
          </Text>
          <Text style={[type.h2, { color: colors.accentInk }]}>{review.scoreLabel}</Text>
        </View>
      </Hero>

      <Card title={t.handoff}>
        <ListRow href={appHref(review.handoff.firstMove.href)} leading={<Text style={styles.handoffCount}>{review.handoff.eventCount}</Text>} title={review.handoff.firstMove.title} subtitle={review.handoff.firstMove.detail} />
      </Card>

      <View style={styles.pair}>
        <Card style={{ flex: 1 }}>
          <Text style={[type.barValue, { color: colors.success }]}>✓ {t.wins}</Text>
          {review.highlights.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={[type.barValue, { color: colors.urgent }]}>! {t.gaps}</Text>
          {review.gaps.map((line) => (
            <Text key={line} style={styles.line}>
              {line}
            </Text>
          ))}
        </Card>
      </View>

      <Card title={t.recommended}>
        {review.actions.map((action) => (
          <ListRow key={action.id} href={appHref(action.href)} title={action.title} />
        ))}
      </Card>

      <View style={styles.reflect}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[type.title, { flex: 1, color: colors.accentTintInk }]}>{t.reflect}</Text>
          <CardLink href="/journal" label={t.journal} />
        </View>
        {review.prompts.map((prompt) => (
          <Text key={prompt} style={styles.prompt}>
            {prompt}
          </Text>
        ))}
      </View>
    </>
  );
}

function Trends() {
  const { data } = useDashboardData();
  const insights = useMemo(() => insightSummary(data), [data]);
  const series = (days: { value: number }[]) => days.map((day) => day.value);
  const tiles: { label: string; value: string | number; unit?: string; spark?: number[] }[] = [
    { label: t.calories, value: insights.averageCalories, spark: series(caloriesByDay(data)) },
    { label: t.workouts, value: insights.workoutMinutes, unit: t.min, spark: series(workoutMinutesByDay(data)) },
    { label: t.habits, value: `${insights.habitCompletionRate}%`, spark: series(habitCheckInsByDay(data)) },
    { label: t.goals, value: `${insights.goalProgressAverage}%` },
    { label: t.mood7, value: insights.sevenDayMood || "–", spark: series(journalMoodByDay(data)) },
    { label: t.sleep, value: formatSleepDuration(insights.sleep.sevenDayAverageMinutes) },
    { label: t.focus, value: formatFocusDuration(insights.focus.weekMinutes), spark: series(focusMinutesByDay(data, 7)) },
    { label: t.weight, value: insights.weight.latest ?? "–", unit: insights.weight.latest === null ? undefined : insights.weight.unit }
  ];
  const rows = [0, 2, 4, 6].map((start) => tiles.slice(start, start + 2));
  return (
    <>
      {rows.map((row) => (
        <View key={row[0].label} style={styles.pair}>
          {row.map((tile) => (
            <Card key={tile.label} style={{ flex: 1 }}>
              <Text style={[type.tileLabel, { fontSize: 12 }]}>{tile.label}</Text>
              <Text style={[type.stat, { fontSize: 22 }]} numberOfLines={1} adjustsFontSizeToFit>
                {tile.value}
                {tile.unit ? <Text style={type.hint}> {tile.unit}</Text> : null}
              </Text>
              {tile.spark ? <TrendBars values={tile.spark} height={28} gap={3} label={tile.label} highlight={tile.spark.length - 1} /> : null}
            </Card>
          ))}
        </View>
      ))}
    </>
  );
}

function Pair({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={type.rowSubtitle}>{label}</Text>
      <Text style={[type.barValue, { fontSize: 12 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 8, minWidth: 92 },
  dayRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  dayTile: { width: 44, alignItems: "center", borderRadius: radius.control, paddingVertical: 4, backgroundColor: colors.surfaceInset },
  dayText: { ...type.rowSubtitle, fontSize: 13, color: colors.ink },
  moreCount: { ...type.badge, color: colors.inkMuted, backgroundColor: colors.surfaceInset, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.chip, overflow: "hidden" },
  when: { ...type.tileLabel, width: 60, fontSize: 12 },
  pair: { flexDirection: "row", gap: 10 },
  big: { ...type.stat, fontSize: 24 },
  modeChip: { minHeight: 34, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  handoffCount: { ...type.stat, fontSize: 34 },
  line: { ...type.rowSubtitle, fontSize: 13, lineHeight: 18, color: colors.ink },
  reflect: { backgroundColor: colors.accentTint, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  prompt: { ...type.body, fontSize: 15, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.15)", paddingTop: 8, writingDirection: "auto" }
});
