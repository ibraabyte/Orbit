import { router } from "expo-router";
import { Fragment, useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, CardLink, CountBadge, EmptyState, IconTile, ListRow, RingGauge, type, type IconName } from "@/components/drift";
import { DOCUMENT_ICONS } from "@/components/document-ui";
import { DoseRow } from "@/components/medication-ui";
import { DayPlanCard } from "@/components/day-plan";
import { MorningBriefCard } from "@/components/morning-brief-card";
import { WeeklySummaryCard } from "@/components/weekly-summary";
import { AheadTiles, Bars, Meter, Panel, Pills, PrayerStrip, StatBox, StatGrid2, Timeline, type TimelineItem } from "@/components/today-parts";
import { useOverlays } from "@/components/overlays";
import { CaptureHint, Columns, ErrorState, HeaderButton, OfflineBanner, Screen, Skeleton, TabHeader, useWide } from "@/components/screen";
import { TaskRow } from "@/components/task-row";
import { colors, fonts, lineHeights, radius, space, textSize } from "@/components/theme";
import { useAppleHealth } from "@/hooks/use-apple-health";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useDayPlan } from "@/hooks/use-day-plan";
import { useMorningBrief } from "@/hooks/use-morning-brief";
import { useNow } from "@/hooks/use-now";
import { usePlanToday } from "@/hooks/use-plan-today";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { useReadiness } from "@/hooks/use-readiness";
import { useSections } from "@/hooks/use-sections";
import { useTodayLayout } from "@/hooks/use-today-layout";
import { useWeeklySummary } from "@/hooks/use-weekly-summary";
import { apiCompleteTask } from "@/lib/api-actions";
import { appHref } from "@/lib/app-href";
import { eventHidden, pathHidden } from "@/lib/app-sections";
import { getApi } from "@/lib/backend";
import { buildCalendarDays, type CalendarEventKind } from "@/lib/calendar";
import { buildDailyBrief, openTasks, summarizeDashboard, todaysTasks } from "@/lib/dashboard";
import { isPastDue } from "@/lib/dates";
import { budgetProgress, formatMoney, monthKey } from "@/lib/finance";
import { habitProgress } from "@/lib/habits";
import { dayLetters, runningTotal, sleepWeek, spendWeek, td, workoutWeek } from "@/lib/today-charts";
import { formatDate, formatNumber, isArabic, t } from "@/lib/i18n";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";
import { buildRail } from "@/lib/rail";
import { dayMuscles, pt, recoveryLine } from "@/lib/plan";
import { daysLeft, documentsDueSoon, documentTitle } from "@/lib/documents";
import { dosesOnDay, rx } from "@/lib/medications";
import { moneyDueSoon } from "@/lib/wealth";
import type { TodayCard } from "@/lib/today-layout";
import { isFriday } from "@/lib/weekly-summary";

const prayerName = (prayer: PrayerTime) => (isArabic ? prayer.label : prayerNamesEn[prayer.name]);

// Today in Refined: the date and title, the next prayer on a sand-edged card, the morning brief, the digest (without
// what attention already lists), then what to do first: what needs attention (overdue tasks, money due) and what is
// next today (timed things still ahead). Then quick numbers (no zeros) and health. Readiness (WHOOP recovery) is one of the quick numbers. A card with nothing in it stays away, so the screen
// only holds what has something to say; when nothing needs doing, one small "all clear" card says so.
export default function Today() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const { next: prayer, today: prayersToday } = usePrayerTimes();
  const readiness = useReadiness();
  const apple = useAppleHealth().today;
  const { toast } = useOverlays();
  const now = useNow();
  const wide = useWide();
  // Which cards show and in what order: set in the Customize sheet (src/app/customize-today.tsx).
  const { layout, ready: choicesRead, shown: show } = useTodayLayout();
  // Sections switched off in Settings leave Today too (their data is kept).
  const { on, hidden: sectionsOff } = useSections();
  // Not asked until the saved choice of hidden cards is read, so a hidden brief is never fetched.
  const brief = useMorningBrief(choicesRead && show("brief"));
  // The day laid out in time around the prayers and WHOOP's energy; made once each morning.
  const dayPlan = useDayPlan(prayersToday, choicesRead && show("dayplan"));
  // The weekly summary is a Friday card; on other days it is one tap away in the assistant.
  const friday = isFriday(now);
  const week = useWeeklySummary(choicesRead && show("week") && friday);
  // Today's workout from the plan, while Exercises is on and the card isn't hidden.
  const planToday = usePlanToday(choicesRead && show("workout") && on("exercises"));

  const rail = useMemo(
    () => buildRail((buildCalendarDays(data, 1, now)[0]?.events ?? []).filter((event) => !eventHidden(event.kind, sectionsOff)), prayersToday, now),
    [data, prayersToday, now, sectionsOff]
  );
  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const moneyDue = useMemo(() => moneyDueSoon(data), [data]);
  // Everything whose time has passed, today's too: Next up only shows what is still ahead.
  const overdue = useMemo(() => openTasks(data.tasks).filter((task) => isPastDue(task.due_at, now)).slice(0, 6), [data.tasks, now]);

  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const calorieShare = calorieTarget ? Math.min(1, summary.todayCalories / calorieTarget) : 0;
  const hasData = data.profile !== null || data.tasks.length > 0;
  const money = show("attention") && on("finance") ? moneyDue : [];
  // The digest skips what the attention card already lists (overdue tasks, money due).
  const shownElsewhere = [...(show("attention") && overdue.length ? ["overdue-tasks"] : []), ...(money.length ? ["overdue-bills", "overdue-installments"] : [])];
  const digest = buildDailyBrief(data)
    .filter((item) => !pathHidden(item.href, sectionsOff) && !shownElsewhere.includes(item.id))
    .slice(0, 5);

  const complete = (taskId: string) => act(() => apiCompleteTask(getApi(), taskId)).then(() => toast(t.done));

  // Pull-to-refresh also asks for a fresh brief and readiness; a failed one never stops the rest from reloading.
  const reload = () => {
    void brief.refresh();
    void readiness.refresh();
    void planToday.refresh();
    if (friday) void week.refresh();
    return refresh();
  };

  const header = <TabHeader kicker={formatDate(now, { weekday: "long", day: "numeric", month: "short" })} title={t.today} />;

  if (!hasData) {
    return (
      <Screen header={header} refreshing={loading} onRefresh={reload}>
        {loading ? <Skeleton /> : <ErrorState detail={error} onRetry={refresh} />}
      </Screen>
    );
  }

  const prayerCard = prayersToday.length ? <PrayerStrip prayers={prayersToday} next={prayer ?? null} now={now} /> : null;

  // The rest of today: what is late (marked), then what is due today and still open.
  const restOfDay = show("attention") ? [...overdue, ...todaysTasks(data.tasks, now).filter((task) => !overdue.includes(task))].slice(0, 8) : [];
  const attentionCard = restOfDay.length ? (
    <Panel title={td.restOfDay} note={`${restOfDay.length}`}>
      <View>
        {restOfDay.map((task, index) => (
          <TaskRow key={task.id} task={task} first={index === 0} />
        ))}
      </View>
    </Panel>
  ) : null;

  // The day top to bottom: the prayers and everything timed, done ones dark, the next one marked "now".
  const timeline: TimelineItem[] = [...rail.earlier, ...rail.entries].flatMap((entry): TimelineItem[] => {
    if (entry.kind === "now") return [];
    const state = entry.past ? "done" : entry.id === rail.focusId ? "now" : "later";
    return entry.kind === "prayer"
      ? [{ id: entry.id, at: entry.at, title: prayerName(entry.prayer), icon: "moon", state, nowLabel: td.now }]
      : [{ id: entry.id, at: entry.at, title: entry.event.title, subtitle: t.railKinds[entry.event.kind], icon: RAIL_ICONS[entry.event.kind], state, href: appHref(entry.event.href), nowLabel: td.now }];
  });
  const nextCard =
    show("upnext") && timeline.some((item) => item.state !== "done") ? (
      <Panel title={td.yourDay} note={td.done(timeline.filter((item) => item.state === "done").length, timeline.length)}>
        <Timeline items={timeline} />
      </Panel>
    ) : null;

  // Nothing late and nothing timed for the rest of the day: one quiet card instead of two empty ones.
  const clearCard =
    show("attention") && !attentionCard && !nextCard && !money.length ? (
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

  // Four squares with a number and a week's chart each. A square with nothing in the week stays away.
  const week7 = dayLetters(now);
  const sleep = sleepWeek(data.sleepLogs, now);
  const spent = spendWeek(data.expenses, currency, now);
  const moved = workoutWeek(data.workouts, now);
  // Apple Health counts for today too; when it and a typed log both have the day, the larger one shows.
  sleep[6] = Math.max(sleep[6]!, (apple?.sleep_minutes ?? 0) / 60);
  moved[6] = Math.max(moved[6]!, apple?.workout_minutes ?? 0);
  const workoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const squares = [
    ...(on("health") && sleep.some(Boolean) ? [<StatBox key="sleep" label={td.sleep} value={formatNumber(Math.round(sleep[6] * 10) / 10)} unit={td.hours} href="/health"><Bars values={sleep} highlight={6} /></StatBox>] : []),
    ...(on("finance") && spent.some(Boolean) ? [<StatBox key="spent" label={td.spending} value={formatNumber(Math.round(spent.reduce((a, b) => a + b, 0)))} unit={currency} href="/finance"><Bars values={runningTotal(spent)} color={colors.accentDeep} /></StatBox>] : []),
    ...(on("food") && calorieTarget ? [<StatBox key="food" label={td.calories} value={formatNumber(summary.todayCalories)} unit={td.of(formatNumber(calorieTarget))} href="/food"><Meter share={calorieShare} /></StatBox>] : []),
    ...(on("exercises") ? [<StatBox key="workout" label={td.workout} value={formatNumber(moved.reduce((a, b) => a + b, 0))} unit={td.of(`${formatNumber(workoutTarget)} ${t.min}`)} href="/health"><Bars values={moved} color={colors.accentDeep} /></StatBox>] : [])
  ];
  const quickTiles = show("quick") && squares.length ? <StatGrid2>{squares}</StatGrid2> : null;

  // Habits as pills: tap one to log it for today; done ones are dark.
  const habitItems = on("habits") ? data.habits.filter((habit) => !habit.archived_at) : [];
  const habitsCard =
    show("habits") && habitItems.length ? (
      <Panel title={td.habits} note={`${summary.completedHabitCount}/${summary.activeHabitCount}`}>
        <Pills
          items={habitItems.map((habit) => {
            const done = habitProgress(habit, data.habitLogs, now).done;
            return { key: habit.id, label: habit.name, on: done, onPress: done ? undefined : () => void act(() => getApi().post("/habit-logs", { habit_id: habit.id, logged_at: new Date().toISOString() })) };
          })}
        />
      </Panel>
    ) : null;

  // The week's spending, a bar a day (today dark), with what is left of this month's budgets.
  const budgets = budgetProgress(data.budgets, data.expenses, monthKey(now)).filter((row) => row.budget.currency === currency);
  const budgetLeft = budgets.reduce((sum, row) => sum + row.limit - row.spent, 0);
  const spendCard =
    show("spend") && on("finance") && spent.some(Boolean) ? (
      <Panel title={td.spendWeek} note={budgets.length ? td.budgetLeft(formatMoney(Math.max(0, budgetLeft), currency)) : undefined} href="/finance">
        <View style={styles.spendRow}>
          <View>
            <Text style={styles.spendTotal}>{formatNumber(Math.round(spent.reduce((a, b) => a + b, 0)))}</Text>
            <Text style={type.rowSubtitle}>{`${currency} ${td.thisWeek}`}</Text>
          </View>
          <View style={{ flex: 1, maxWidth: 180 }}>
            <Bars values={spent} highlight={6} height={56} labels={week7} />
          </View>
        </View>
      </Panel>
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
        <View style={{ paddingTop: space.md, alignItems: "flex-start" }}>
          <CardLink href="/medications" label={rx.medications} />
        </View>
      ) : null}
    </Card>
  ) : null;

  // Coming up: money due (late, today, tomorrow) and papers expiring, as small squares.
  const docsDue = on("documents") ? documentsDueSoon(data.documents, now) : [];
  const ahead = show("docs")
    ? [
        ...money.map((item) => ({ id: item.id, icon: "credit-card" as const, title: item.title, when: item.state === "overdue" ? t.overdue : item.state === "today" ? t.dueToday : t.dueTomorrow, href: "/finance" as const })),
        ...docsDue.map((document) => ({ id: document.id, icon: DOCUMENT_ICONS[document.kind], title: documentTitle(document), when: td.inDays(daysLeft(document, now)), href: "/documents" as const }))
      ].slice(0, 3)
    : [];
  const docsCard = ahead.length ? (
    <Panel title={td.ahead}>
      <AheadTiles items={ahead} />
    </Panel>
  ) : null;

  // Your body today: recovery, calories and habits as rings; a ring with nothing behind it stays away.
  const rings = [
    ...(on("whoop") && readiness.value !== null ? [{ key: "recovery", share: readiness.value / 100, label: `${formatNumber(readiness.value)}%`, name: td.recovery, color: colors.urgent }] : []),
    ...(on("food") && calorieTarget ? [{ key: "food", share: calorieShare, label: formatNumber(summary.todayCalories), name: td.calories, color: colors.accent }] : []),
    ...(on("habits") && summary.activeHabitCount ? [{ key: "habits", share: summary.completedHabitCount / summary.activeHabitCount, label: `${summary.completedHabitCount}/${summary.activeHabitCount}`, name: td.habits, color: colors.accentDeep }] : [])
  ];
  const healthCard =
    show("health") && on("health") && rings.length ? (
      <Panel title={td.body} href="/health">
        <View style={styles.rings}>
          {rings.map((ring) => (
            <View key={ring.key} style={styles.ring}>
              <RingGauge value={ring.share} size={76} thickness={8} label={ring.label} color={ring.color} />
              <Text style={type.rowSubtitle}>{ring.name}</Text>
            </View>
          ))}
        </View>
      </Panel>
    ) : null;

  // The morning brief comes right after the prayer, even while it is still asking for AI or permission.
  const briefCard = show("brief") ? <MorningBriefCard state={brief.state} data={data} retry={() => void brief.refresh()} /> : null;
  // The capture line is a first-day hint; once something has been captured, the tab bar's button is enough.
  const newcomer = !data.tasks.length && !data.expenses.length;

  // Each card in the order chosen in Customize. With nothing late or ahead, the quiet "all clear" card takes the
  // attention card's place.
  const cards: Record<TodayCard, ReactNode> = {
    brief: briefCard,
    dayplan: show("dayplan") ? <DayPlanCard state={dayPlan.state} now={now} tasks={data.tasks} retry={() => void dayPlan.refresh()} onDone={(taskId) => void complete(taskId)} /> : null,
    digest: digestCard,
    attention: attentionCard ?? clearCard,
    upnext: nextCard,
    habits: habitsCard,
    spend: spendCard,
    meds: medsCard,
    docs: docsCard,
    workout: workoutCard,
    week: friday && show("week") ? <WeeklySummaryCard state={week.state} retry={() => void week.refresh()} /> : null,
    quick: quickTiles,
    health: healthCard
  };
  const placed = (list: TodayCard[]) => list.map((card) => <Fragment key={card}>{cards[card]}</Fragment>);
  // ponytail: on iPad the charts (body, numbers, habits, spending) take the second column; on a phone everything is
  // one column in the chosen order.
  const side: TodayCard[] = ["health", "quick", "habits", "spend"];

  return (
    <Screen wide header={header} banner={error ? <OfflineBanner message={t.offline} /> : undefined} refreshing={loading} onRefresh={reload}>
      {wide ? (
        <Columns
          left={
            <>
              {prayerCard}
              {newcomer ? <CaptureHint hint={t.capturePh} /> : null}
              {placed(layout.order.filter((card) => !side.includes(card)))}
            </>
          }
          right={<>{placed(layout.order.filter((card) => side.includes(card)))}</>}
        />
      ) : (
        <>
          {prayerCard}
          {newcomer ? <CaptureHint hint={t.capturePh} /> : null}
          {placed(layout.order)}
        </>
      )}
      {/* Which cards Today shows and their order: set now and then, so it waits at the end instead of beside the title. */}
      <View style={{ alignItems: "center", paddingTop: space.lg }}>
        <HeaderButton icon="sliders" label={t.customize} onPress={() => router.push("/customize-today")} />
      </View>
    </Screen>
  );
}

const RAIL_ICONS: Record<CalendarEventKind, IconName> = { task: "check-square", reminder: "bell", meal: "coffee", mealPlan: "coffee", grocery: "check-square", workout: "activity", weight: "activity", sleep: "moon", expense: "credit-card", bill: "credit-card" };

function digestIcon(tone?: string | null) {
  if (tone === "danger") return "alert-circle" as const;
  if (tone === "warning") return "alert-triangle" as const;
  return "arrow-right" as const;
}

const styles = StyleSheet.create({
  heroMark: { width: 40, height: 40, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.accentWash, alignItems: "center", justifyContent: "center" },
  heroValue: { fontFamily: fonts.semibold, fontSize: textSize.headline, lineHeight: lineHeights.headline, color: colors.ink },
  heroIn: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.link },
  spendRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.lg },
  spendTotal: { fontFamily: fonts.bold, fontSize: textSize.title2, color: colors.ink, writingDirection: "ltr" },
  rings: { flexDirection: "row", justifyContent: "space-around" },
  ring: { alignItems: "center", gap: space.sm },
  nextRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.surfaceInset, backgroundColor: colors.surface },
  nextTime: { width: 52, fontFamily: fonts.semibold, fontSize: textSize.caption1, color: colors.inkMuted, writingDirection: "ltr" }
});
