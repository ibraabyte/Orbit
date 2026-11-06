import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, CardLink, EmptyState, IconTile, ListRow, Metric, RingGauge, RowButton, StatGrid, StatTile, type } from "@/components/drift";
import { MorningBriefCard } from "@/components/morning-brief-card";
import { useOverlays } from "@/components/overlays";
import { Columns, ErrorState, HeaderButton, OfflineBanner, openCapture, Screen, Skeleton } from "@/components/screen";
import { SwipeToDone } from "@/components/swipe-to-done";
import { TaskRow } from "@/components/task-row";
import { colors, fonts, labelCase, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useMorningBrief } from "@/hooks/use-morning-brief";
import { useNow } from "@/hooks/use-now";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { useReadiness } from "@/hooks/use-readiness";
import { apiCompleteTask, apiUpdate } from "@/lib/api-actions";
import { appHref } from "@/lib/app-href";
import { getApi } from "@/lib/backend";
import { buildCalendarDays } from "@/lib/calendar";
import { buildDailyBrief, openTasks, summarizeDashboard } from "@/lib/dashboard";
import { isPastDue } from "@/lib/dates";
import { formatMoney, nextBillDueDate } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { captureStarters, formatClock24, formatDate, formatIn, formatNumber, isArabic, t } from "@/lib/i18n";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";
import { buildRail, type RailEntry } from "@/lib/rail";
import { formatSleepDuration } from "@/lib/sleep";
import { cardLabel, moneyDueSoon, type MoneyDue } from "@/lib/wealth";

const hiddenKey = "orbit.today.hidden";
// "next" (Next up) is gone: the rail is the day's next-up now. Old saved choices that name it are ignored.
const optional = [
  ["brief", t.morningBrief],
  ["money", t.moneyDue],
  ["digest", t.digest],
  ["quick", t.quick],
  ["health", t.healthToday]
] as const;
type OptionalSection = (typeof optional)[number][0];

const prayerName = (prayer: PrayerTime) => (isArabic ? prayer.label : prayerNamesEn[prayer.name]);
const minutesUntil = (at: Date) => Math.max(0, Math.round((at.getTime() - Date.now()) / 60_000));

// Today = the Rail: a big clock and readiness, the day as a time line (prayers as ticks, timed things on their time,
// a sand line for now), then what fell off the rail (overdue tasks, money due), the brief and the capture bar.
export default function Today() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const { next: prayer, today: prayersToday } = usePrayerTimes();
  const readiness = useReadiness();
  const { sheet, toast } = useOverlays();
  const now = useNow();
  const [hidden, setHidden] = useState<OptionalSection[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const show = (section: OptionalSection) => !hidden.includes(section);
  // Not asked until the saved choice of hidden sections is read, so a hidden brief is never fetched.
  const [choicesRead, setChoicesRead] = useState(false);
  const brief = useMorningBrief(choicesRead && show("brief"));

  useEffect(() => {
    AsyncStorage.getItem(hiddenKey)
      .then((saved) => saved && setHidden(JSON.parse(saved)))
      .catch(() => undefined)
      .finally(() => setChoicesRead(true));
  }, []);

  const rail = useMemo(() => buildRail(buildCalendarDays(data, 1, now)[0]?.events ?? [], prayersToday, now), [data, prayersToday, now]);
  const summary = useMemo(() => summarizeDashboard(data), [data]);
  const digest = useMemo(() => buildDailyBrief(data).slice(0, 5), [data]);
  const food = useMemo(() => foodSummary(data), [data]);
  const moneyDue = useMemo(() => moneyDueSoon(data), [data]);
  // Everything whose time has passed, today's too: the rail only shows tasks still ahead.
  const overdue = useMemo(() => openTasks(data.tasks).filter((task) => isPastDue(task.due_at, now)).slice(0, 6), [data.tasks, now]);

  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const calorieTarget = data.profile?.daily_calorie_target ?? null;
  const calorieShare = calorieTarget ? Math.min(1, summary.todayCalories / calorieTarget) : 0;
  const hasData = data.profile !== null || data.tasks.length > 0;
  const offRail = overdue.length + (show("money") ? moneyDue.length : 0);
  const railHasThings = [...rail.earlier, ...rail.entries].some((entry) => entry.kind === "event");

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
    return refresh();
  };

  const [hours, minutes] = formatClock24(now).split(/[:٫]/);
  const header = (
    <View style={styles.top}>
      <View style={styles.topRow}>
        <Text style={type.shellMeta}>{formatDate(now, { weekday: "short", day: "numeric", month: "short" })}</Text>
        <HeaderButton icon="sliders" label={t.customize} onPress={customize} />
      </View>
      <View style={styles.clockRow}>
        <Text style={styles.clock} accessibilityRole="header" accessibilityLabel={`${t.today} ${formatClock24(now)}`}>
          {hours}
          <Text style={{ color: colors.accent }}>:</Text>
          {minutes}
        </Text>
        {readiness.value !== null ? (
          <Pressable onPress={() => router.push("/whoop")} accessibilityRole="button" accessibilityLabel={`${t.readiness} ${readiness.value}`} style={styles.side}>
            <Text style={type.shellMeta}>{t.readiness}</Text>
            <Text style={styles.sideValue}>{formatNumber(readiness.value)}</Text>
          </Pressable>
        ) : prayer ? (
          <View style={styles.side}>
            <Text style={type.shellMeta}>{t.nextPrayer}</Text>
            <Text style={styles.sideValue}>{prayerName(prayer)}</Text>
            <Text style={[type.shellMeta, { color: colors.accent }]}>{formatIn(minutesUntil(prayer.at))}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!hasData) {
    return (
      <Screen header={header} refreshing={loading} onRefresh={reload}>
        {loading ? <Skeleton /> : <ErrorState detail={error} onRetry={refresh} />}
      </Screen>
    );
  }

  const renderEntry = (entry: RailEntry) => {
    if (entry.kind === "now") {
      return (
        <View key="now" style={[styles.row, { minHeight: 30 }]} accessibilityLabel={`${t.now} ${formatClock24(entry.at)}`}>
          <Text style={[styles.time, { color: colors.accent, fontFamily: fonts.semibold, ...labelCase }]}>{t.now}</Text>
          <View style={styles.tickCell}>
            <View style={styles.nowDot} />
          </View>
          <View style={styles.nowLine} />
        </View>
      );
    }
    if (entry.kind === "prayer") {
      const tone = entry.next ? colors.accent : colors.onShellMuted;
      const label = `▲ ${prayerName(entry.prayer)}${entry.next ? ` · ${formatIn(minutesUntil(entry.at))}` : ""}`;
      return (
        <View key={entry.id} style={[styles.row, { minHeight: 40 }]}>
          <Text style={[styles.time, entry.next && { color: colors.accent }]}>{formatClock24(entry.at)}</Text>
          <View style={styles.tickCell}>
            <View style={[styles.tick, entry.next && { backgroundColor: colors.accent }]} />
          </View>
          <Text style={[styles.prayer, { color: tone }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      );
    }

    const { event, past, taskId } = entry;
    const focus = entry.id === rail.focusId;
    // Things that happened (a meal eaten, a workout done) are struck through; a passed reminder is only dimmed.
    const struck = past && (event.kind === "meal" || event.kind === "workout" || event.kind === "sleep");
    const open = () => router.push(appHref(event.href));
    const body = (
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${t.railKinds[event.kind]}: ${event.title}, ${formatClock24(entry.at)}`} style={[styles.thing, focus && styles.focus]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.thingTitle, past && { color: colors.onShellMuted }, struck && styles.struck]} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.thingKind}>{t.railKinds[event.kind]}</Text>
        </View>
        {focus ? taskId ? <RowButton label={t.done} onPress={() => void complete(taskId)} /> : <RowButton label={t.openItem} onPress={open} /> : null}
      </Pressable>
    );
    return (
      <View key={entry.id} style={[styles.row, { minHeight: focus ? 76 : 56 }]}>
        <Text style={[styles.time, !past && { color: colors.ink }]}>{formatClock24(entry.at)}</Text>
        <View style={styles.tickCell}>
          <View style={styles.tick} />
        </View>
        <View style={{ flex: 1 }}>{taskId && !focus ? <SwipeToDone onDone={() => void complete(taskId)}>{body}</SwipeToDone> : body}</View>
      </View>
    );
  };

  const railSection = (
    <View style={styles.rail}>
      <View style={styles.railLine} />
      {rail.earlier.length ? (
        showEarlier ? (
          rail.earlier.map(renderEntry)
        ) : (
          <Pressable onPress={() => setShowEarlier(true)} accessibilityRole="button" style={[styles.row, { minHeight: 36 }]}>
            <Text style={styles.time}>{formatClock24(rail.earlier[0].at)}</Text>
            <View style={styles.tickCell}>
              <View style={styles.tick} />
            </View>
            <Text style={[styles.prayer, { color: colors.onShellMuted }]}>
              {t.earlier} · {formatNumber(rail.earlier.length)} ↓
            </Text>
          </Pressable>
        )
      ) : null}
      {rail.entries.map(renderEntry)}
      {!railHasThings ? <EmptyState example={isArabic ? "ذكرني أتصل بأمي ٩ الليل" : "call mom 9pm"}>{t.railEmpty}</EmptyState> : null}
    </View>
  );

  const offRailSection = offRail ? (
    <Card title={t.offRail} action={<Text style={styles.count}>{formatNumber(offRail)}</Text>}>
      {overdue.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
      {show("money")
        ? moneyDue.map((item, index) => (
            <ListRow
              key={item.id}
              first={!overdue.length && index === 0}
              title={item.title}
              badges={item.state === "overdue" ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : item.state === "today" ? <Badge tone="accent" glyph="◷">{t.dueToday}</Badge> : <Badge glyph="○">{t.dueTomorrow}</Badge>}
              subtitle={item.kind === "installment" ? t.installment : item.card ? `${t.chargedTo} ${cardLabel(item.card)}` : null}
              meta={formatMoney(item.amount, item.currency)}
              trailing={<RowButton label={t.markPaid} onPress={() => void pay(item)} />}
            />
          ))
        : null}
    </Card>
  ) : null;

  const captureSection = (
    <View style={styles.captureWrap}>
      <Pressable onPress={() => openCapture()} accessibilityRole="button" accessibilityLabel={t.capture} style={styles.captureBar}>
        <Text style={styles.capturePlaceholder} numberOfLines={1}>
          {t.capturePh}
        </Text>
        <View style={styles.captureMark}>
          <Text style={styles.capturePlus}>+</Text>
        </View>
      </Pressable>
      <View style={styles.starters}>
        {captureStarters.map((word) => (
          <Pressable key={word} onPress={() => openCapture(word)} accessibilityRole="button" style={styles.starter}>
            <Text style={[type.pill, { color: colors.inkMuted }]}>{word.trim()}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const extras = (
    <>
      {show("brief") ? <MorningBriefCard state={brief.state} data={data} retry={() => void brief.refresh()} /> : null}

      {show("digest") ? (
        <Card title={t.digest} action={<Text style={styles.count}>{formatNumber(digest.length)}</Text>}>
          {digest.length ? (
            digest.map((item) => (
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
        <StatGrid columns={3}>
          {[
            <StatTile key="tasks" href="/tasks" label={t.openTasks} value={summary.openTaskCount} alert={summary.overdueTaskCount > 0} />,
            <StatTile key="reminders" href="/tasks" label={t.dueReminders} value={summary.dueReminderCount} alert={summary.dueReminderCount > 0} />,
            <StatTile key="meals" href="/food" label={t.mealsPlanned} value={food.todayPlannedMeals} />,
            <StatTile key="spent" href="/finance" label={t.spentToday} value={formatMoney(summary.todaySpending, currency)} />,
            <StatTile key="habits" href="/habits" label={t.habitsDone} value={`${summary.completedHabitCount}/${summary.activeHabitCount}`} />
          ]}
        </StatGrid>
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
    </>
  );

  // Phone: rail, off the rail, capture, then the rest. iPad: the rail on one side, everything else on the other.
  return (
    <Screen wide header={header} banner={error ? <OfflineBanner message={t.offline} /> : undefined} refreshing={loading} onRefresh={reload}>
      <Columns
        left={railSection}
        right={
          <>
            {offRailSection}
            {captureSection}
            {extras}
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

const TIME = 48;
const TICK = 28;

const styles = StyleSheet.create({
  top: { gap: 10, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.hairline },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clockRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  clock: { fontFamily: fonts.medium, fontSize: 64, lineHeight: 66, letterSpacing: -3, color: colors.onShell, writingDirection: "ltr" },
  side: { alignItems: "flex-end", gap: 2, paddingBottom: 6 },
  sideValue: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, color: colors.onShell },
  rail: { position: "relative", paddingTop: 4 },
  railLine: { position: "absolute", start: TIME + TICK / 2, top: 8, bottom: 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center" },
  time: { width: TIME, fontFamily: fonts.regular, fontSize: 11, color: colors.onShellMuted, writingDirection: "ltr" },
  tickCell: { width: TICK, alignItems: "center", justifyContent: "center" },
  tick: { width: 9, height: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.3)" },
  nowDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  nowLine: { flex: 1, height: 1, backgroundColor: colors.accent },
  prayer: { flex: 1, fontFamily: fonts.medium, fontSize: 11, ...labelCase },
  thing: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingStart: 4 },
  focus: { borderWidth: 1, borderColor: "rgba(232,200,144,0.45)", borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  thingTitle: { fontFamily: fonts.medium, fontSize: 14, color: colors.onShell },
  thingKind: { marginTop: 3, fontFamily: fonts.regular, fontSize: 11, color: colors.onShellMuted, ...labelCase },
  struck: { textDecorationLine: "line-through" },
  count: { fontFamily: fonts.medium, fontSize: 11, color: colors.accent },
  captureWrap: { gap: 10, paddingTop: 6 },
  captureBar: { height: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingStart: 16, paddingEnd: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  captureMark: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  capturePlus: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 22, color: colors.accentInk },
  capturePlaceholder: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: colors.onShellMuted },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  starter: { minHeight: 30, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.hairline }
});
