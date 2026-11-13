import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, CardLink, Chevron, CountBadge, EmptyState, Hero, Icon, IconTile, ListRow, Metric, RingGauge, RowButton, StatGrid, StatTile, type } from "@/components/drift";
import { DoseRow } from "@/components/medication-ui";
import { MorningBriefCard } from "@/components/morning-brief-card";
import { WeeklySummaryCard } from "@/components/weekly-summary";
import { useOverlays } from "@/components/overlays";
import { CaptureHint, Columns, ErrorState, HeaderButton, OfflineBanner, Screen, Skeleton, TabHeader, useWide } from "@/components/screen";
import { SwipeToDone } from "@/components/swipe-to-done";
import { TaskRow } from "@/components/task-row";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useMorningBrief } from "@/hooks/use-morning-brief";
import { useNow } from "@/hooks/use-now";
import { usePlanToday } from "@/hooks/use-plan-today";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { useReadiness } from "@/hooks/use-readiness";
import { useSections } from "@/hooks/use-sections";
import { useWeeklySummary } from "@/hooks/use-weekly-summary";
import { apiCompleteTask, apiUpdate } from "@/lib/api-actions";
import { appHref } from "@/lib/app-href";
import { eventHidden, pathHidden } from "@/lib/app-sections";
import { getApi } from "@/lib/backend";
import { buildCalendarDays } from "@/lib/calendar";
import { buildDailyBrief, openTasks, summarizeDashboard } from "@/lib/dashboard";
import { isPastDue } from "@/lib/dates";
import { formatMoney, nextBillDueDate } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { formatClock24, formatDate, formatIn, formatNumber, isArabic, t } from "@/lib/i18n";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";
import { buildRail, type RailEntry } from "@/lib/rail";
import { dayMuscles, pt, recoveryLine } from "@/lib/plan";
import { dosesOnDay, rx } from "@/lib/medications";
import { formatSleepDuration } from "@/lib/sleep";
import { cardLabel, moneyDueSoon, type MoneyDue } from "@/lib/wealth";
import { isFriday } from "@/lib/weekly-summary";

const hiddenKey = "orbit.today.hidden";
// "upnext" is the Next up card. The old "next" id (from before the rail) is ignored, so an old saved choice cannot hide it.
const optional = [
  ["brief", t.morningBrief],
  ["week", t.weekSummary],
  ["money", t.moneyDue],
  ["digest", t.digest],
  ["quick", t.quick],
  ["upnext", t.nextUp],
  ["workout", pt.todayWorkout],
  ["meds", rx.todayDoses],
  ["health", t.healthToday]
] as const;
type OptionalSection = (typeof optional)[number][0];

const prayerName = (prayer: PrayerTime) => (isArabic ? prayer.label : prayerNamesEn[prayer.name]);
const minutesUntil = (at: Date) => Math.max(0, Math.round((at.getTime() - Date.now()) / 60_000));

// Today in Refined: the date and title, the next prayer on a sand-edged card, then cards: the brief, the digest,
// quick numbers, what needs attention (overdue tasks, money due), what is next today (timed things still ahead), and
// health. Readiness (WHOOP recovery) is one of the quick numbers. A card with nothing in it stays away, so the screen
// only holds what has something to say; when nothing needs doing, one small "all clear" card says so.
export default function Today() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const { next: prayer, today: prayersToday } = usePrayerTimes();
  const readiness = useReadiness();
  const { sheet, toast } = useOverlays();
  const now = useNow();
  // iPad, two columns: the quick numbers move to the top of the right column, so both columns end at about the same height.
  const wide = useWide();
  const [hidden, setHidden] = useState<OptionalSection[]>([]);
  const show = (section: OptionalSection) => !hidden.includes(section);
  // Sections switched off in Settings leave Today too (their data is kept).
  const { on, hidden: sectionsOff } = useSections();
  // Not asked until the saved choice of hidden sections is read, so a hidden brief is never fetched.
  const [choicesRead, setChoicesRead] = useState(false);
  const brief = useMorningBrief(choicesRead && show("brief"));
  // The weekly summary is a Friday card; on other days it is one tap away in the assistant.
  const friday = isFriday(now);
  const week = useWeeklySummary(choicesRead && show("week") && friday);
  // Today's workout from the plan, while Exercises is on and the card isn't hidden.
  const planToday = usePlanToday(choicesRead && show("workout") && on("exercises"));

  useEffect(() => {
    AsyncStorage.getItem(hiddenKey)
      .then((saved) => saved && setHidden(JSON.parse(saved)))
      .catch(() => undefined)
      .finally(() => setChoicesRead(true));
  }, []);

  const rail = useMemo(
    () => buildRail((buildCalendarDays(data, 1, now)[0]?.events ?? []).filter((event) => !eventHidden(event.kind, sectionsOff)), prayersToday, now),
    [data, prayersToday, now, sectionsOff]
  );
  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const digest = useMemo(() => buildDailyBrief(data).filter((item) => !pathHidden(item.href, sectionsOff)).slice(0, 5), [data, sectionsOff]);
  const food = useMemo(() => foodSummary(data), [data]);
  const moneyDue = useMemo(() => moneyDueSoon(data), [data]);
  // Everything whose time has passed, today's too: Next up only shows what is still ahead.
  const overdue = useMemo(() => openTasks(data.tasks).filter((task) => isPastDue(task.due_at, now)).slice(0, 6), [data.tasks, now]);

  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const calorieShare = calorieTarget ? Math.min(1, summary.todayCalories / calorieTarget) : 0;
  const hasData = data.profile !== null || data.tasks.length > 0;
  const money = show("money") && on("finance") ? moneyDue : [];
  const attentionCount = overdue.length + money.length;
  // What is still ahead today (not prayers: the next one has its own card).
  const upNext = rail.entries.filter((entry): entry is Extract<RailEntry, { kind: "event" }> => entry.kind === "event" && !entry.past).slice(0, 8);

  const customize = () =>
    sheet({
      title: t.customize,
      options: optional.filter(([id]) => (id === "money" ? on("finance") : id === "health" ? on("health") : id === "workout" ? on("exercises") : id === "meds" ? on("medications") : true)).map(([id, label]) => ({
        label: `${show(id) ? "●" : "○"} ${label}`,
        run: () => {
          const next = show(id) ? [...hidden, id] : hidden.filter((item) => item !== id);
          setHidden(next);
          void AsyncStorage.setItem(hiddenKey, JSON.stringify(next)).catch(() => undefined);
        }
      }))
    });

  // Paid: an installment is ticked off; a repeating bill moves to its next date, a one-off one is marked paid.
  const pay = (item: MoneyDue) => {
    if (item.installment) return act(() => apiUpdate(getApi(), "/obligation-installments", item.installment!.id, { paid_at: new Date().toISOString() }));
    if (!item.bill) return;
    const nextDue = nextBillDueDate(item.bill);
    return act(() => apiUpdate(getApi(), "/bills", item.bill!.id, nextDue ? { due_at: nextDue, status: "active" } : { status: "paid" }));
  };

  const complete = (taskId: string) => act(() => apiCompleteTask(getApi(), taskId)).then(() => toast(t.done));

  // Pull-to-refresh also asks for a fresh brief and readiness; a failed one never stops the rest from reloading.
  const reload = () => {
    void brief.refresh();
    void readiness.refresh();
    void planToday.refresh();
    if (friday) void week.refresh();
    return refresh();
  };

  const header = <TabHeader kicker={formatDate(now, { weekday: "long", day: "numeric", month: "short" })} title={t.today} action={<HeaderButton icon="sliders" label={t.customize} onPress={customize} />} />;

  if (!hasData) {
    return (
      <Screen header={header} refreshing={loading} onRefresh={reload}>
        {loading ? <Skeleton /> : <ErrorState detail={error} onRetry={refresh} />}
      </Screen>
    );
  }

  const prayerCard = prayer ? (
    <Hero>
      <View style={styles.heroMark}>
        <Icon name="moon" size={19} color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.rowSubtitle}>{t.nextPrayer}</Text>
        <Text style={styles.heroValue} numberOfLines={1}>
          {prayerName(prayer)} · <Text style={{ writingDirection: "ltr" }}>{formatClock24(prayer.at)}</Text>
        </Text>
      </View>
      <Text style={styles.heroIn}>{formatIn(minutesUntil(prayer.at))}</Text>
    </Hero>
  ) : null;

  const renderNext = (entry: Extract<RailEntry, { kind: "event" }>, index: number) => {
    const { event, taskId } = entry;
    const focus = entry.id === rail.focusId;
    const open = () => router.push(appHref(event.href));
    const row = (
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${t.railKinds[event.kind]}: ${event.title}, ${formatClock24(entry.at)}`} style={[styles.nextRow, index === 0 && { borderTopWidth: 0 }]}>
        <Text style={[styles.nextTime, focus && { color: colors.accent }]}>{formatClock24(entry.at)}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.rowTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={type.rowSubtitle}>{t.railKinds[event.kind]}</Text>
        </View>
        {focus && taskId ? <RowButton label={t.done} onPress={() => void complete(taskId)} /> : <Chevron />}
      </Pressable>
    );
    return <View key={entry.id}>{taskId && !focus ? <SwipeToDone onDone={() => void complete(taskId)}>{row}</SwipeToDone> : row}</View>;
  };

  const attentionCard = attentionCount ? (
    <Card title={t.attention} action={<CardLink href="/tasks" label={t.tasks} />}>
      {overdue.map((task, index) => (
        <TaskRow key={task.id} task={task} first={index === 0} />
      ))}
      {money.map((item, index) => (
        <ListRow
          key={item.id}
          first={!overdue.length && index === 0}
          title={item.title}
          badges={item.state === "overdue" ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : item.state === "today" ? <Badge tone="accent" glyph="•">{t.dueToday}</Badge> : <Badge glyph="○">{t.dueTomorrow}</Badge>}
          subtitle={item.kind === "installment" ? t.installment : item.card ? `${t.chargedTo} ${cardLabel(item.card)}` : null}
          meta={formatMoney(item.amount, item.currency)}
          trailing={<RowButton label={t.markPaid} onPress={() => void pay(item)} />}
        />
      ))}
    </Card>
  ) : null;

  const nextCard =
    show("upnext") && upNext.length ? (
      <Card title={t.nextUp} action={<CountBadge value={upNext.length} />}>
        <View>{upNext.map(renderNext)}</View>
      </Card>
    ) : null;

  // Nothing late and nothing timed for the rest of the day: one quiet card instead of two empty ones.
  const clearCard =
    !attentionCard && !nextCard ? (
      <Card>
        <EmptyState icon="check" example={isArabic ? "ذكرني أتصل بأمي ٩ الليل" : "call mom 9pm"}>{`${t.allClear} · ${t.allClearBody}`}</EmptyState>
      </Card>
    ) : null;

  const digestCard =
    show("digest") && digest.length ? (
      <Card title={t.digest} action={<CountBadge value={digest.length} />}>
        {digest.map((item, index) => (
          <ListRow
            key={item.id}
            first={index === 0}
            href={appHref(item.href)}
            leading={<IconTile name={digestIcon(item.tone)} size={28} tone={item.tone === "danger" ? "urgent" : item.tone === "warning" ? "accent" : "neutral"} />}
            title={item.title}
            subtitle={item.detail}
          />
        ))}
      </Card>
    ) : null;

  const quickTiles = show("quick") ? (
    <StatGrid columns={3}>
      {[
        <StatTile key="tasks" href="/tasks" label={t.openTasks} value={summary.openTaskCount} alert={summary.overdueTaskCount > 0} />,
        <StatTile key="reminders" href="/tasks" label={t.dueReminders} value={summary.dueReminderCount} alert={summary.dueReminderCount > 0} />,
        ...(readiness.value !== null && on("whoop") ? [<StatTile key="readiness" href="/whoop" label={t.readiness} value={formatNumber(readiness.value)} color={colors.accentDeep} />] : []),
        ...(on("food") ? [<StatTile key="meals" href="/food" label={t.mealsPlanned} value={food.todayPlannedMeals} />] : []),
        ...(on("finance") ? [<StatTile key="spent" href="/finance" label={t.spentToday} value={formatMoney(summary.todaySpending, currency)} />] : []),
        ...(on("habits") ? [<StatTile key="habits" href="/habits" label={t.habitsDone} value={`${summary.completedHabitCount}/${summary.activeHabitCount}`} />] : [])
      ]}
    </StatGrid>
  ) : null;

  // The plan's workout for today until it's done; a rest day or no plan shows nothing.
  const workoutDay = show("workout") && on("exercises") ? planToday.day : null;
  const workoutCard =
    workoutDay && workoutDay.status !== "done" ? (
      <Card title={pt.todayWorkout} action={<CardLink href="/plan" label={pt.plan} />}>
        <ListRow
          first
          href="/plan"
          leading={<IconTile name="activity" tone={workoutDay.adjustment === "rest" ? "urgent" : "accent"} />}
          title={pt.kinds[workoutDay.kind]}
          badges={workoutDay.status === "started" ? <Badge tone="accent" glyph="●">{pt.status.started}</Badge> : undefined}
          subtitle={[dayMuscles(workoutDay), recoveryLine(workoutDay)].filter(Boolean).join(" · ")}
        />
      </Card>
    ) : null;

  // Today's doses while Medications is on: what's still open and what was answered, earliest first.
  const doses = show("meds") && on("medications") ? dosesOnDay(data.medications, data.medicationDoses, now, now) : [];
  const openDoses = doses.filter((entry) => !entry.dose);
  const medsCard = doses.length ? (
    <Card title={rx.todayDoses} action={openDoses.length ? <CountBadge value={openDoses.length} alert={openDoses.some((entry) => entry.state === "missed")} /> : <CardLink href="/medications" label={rx.medications} />}>
      {doses.slice(0, 8).map((entry, index) => (
        <DoseRow key={entry.key} entry={entry} first={index === 0} />
      ))}
      {openDoses.length ? (
        <View style={{ paddingTop: 10, alignItems: "flex-start" }}>
          <CardLink href="/medications" label={rx.medications} />
        </View>
      ) : null}
    </Card>
  ) : null;

  // Health shows once something is logged today (food, a workout, sleep); before that it would be a row of zeros.
  // With Food off, the card keeps workouts and sleep and drops the calorie ring.
  const foodOn = on("food");
  const healthLogged = (foodOn && summary.todayCalories > 0) || summary.todayWorkoutMinutes > 0 || summary.todaySleepMinutes > 0;
  const healthCard = show("health") && on("health") && healthLogged ? (
    <Card title={t.healthToday} action={<CardLink href="/health" label={t.health} />}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        {foodOn ? <RingGauge value={calorieShare} label={calorieTarget ? `${Math.round(calorieShare * 100)}%` : "–"} /> : null}
        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          {foodOn ? (
            <View style={{ flex: 1 }}>
              <Metric label={t.calories} value={summary.todayCalories} unit={calorieTarget ? `/ ${calorieTarget}` : undefined} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Metric label={t.workouts} value={summary.todayWorkoutMinutes} unit={t.min} />
          </View>
          <View style={{ flex: 1 }}>
            <Metric label={t.sleep} value={formatSleepDuration(summary.todaySleepMinutes)} />
          </View>
        </View>
      </View>
    </Card>
  ) : null;

  // Phone: one column in Refined's order. iPad: the overview on one side, what to do on the other.
  return (
    <Screen wide header={header} banner={error ? <OfflineBanner message={t.offline} /> : undefined} refreshing={loading} onRefresh={reload}>
      <Columns
        left={
          <>
            {prayerCard}
            <CaptureHint hint={t.capturePh} />
            {show("brief") ? <MorningBriefCard state={brief.state} data={data} retry={() => void brief.refresh()} /> : null}
            {friday && show("week") ? <WeeklySummaryCard state={week.state} retry={() => void week.refresh()} /> : null}
            {digestCard}
            {wide ? null : quickTiles}
          </>
        }
        right={
          <>
            {wide ? quickTiles : null}
            {attentionCard}
            {nextCard}
            {clearCard}
            {medsCard}
            {workoutCard}
            {healthCard}
          </>
        }
      />
    </Screen>
  );
}

function digestIcon(tone?: string | null) {
  if (tone === "danger") return "alert-circle" as const;
  if (tone === "warning") return "alert-triangle" as const;
  return "arrow-right" as const;
}

const styles = StyleSheet.create({
  heroMark: { width: 40, height: 40, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: "rgba(232,200,144,0.1)", alignItems: "center", justifyContent: "center" },
  heroValue: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.ink },
  heroIn: { fontFamily: fonts.medium, fontSize: 13, color: colors.accent },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.surfaceInset, backgroundColor: colors.surface },
  nextTime: { width: 52, fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMuted, writingDirection: "ltr" }
});
