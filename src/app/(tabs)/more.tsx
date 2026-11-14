import { Link, router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BentoGrid, BentoTile, Card, Icon, IconTile, ListRow, RingGauge } from "@/components/drift";
import { GroupHeader, HeaderButton, Screen, TabHeader } from "@/components/screen";
import { insideFinance, insideHealth, mt, useSectionStatus, useVisibleSections, type Section } from "@/components/sections";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { openTasks, summarizeDashboard, weeklySummary } from "@/lib/dashboard";
import { isPastDue } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import { completedHabitsToday } from "@/lib/habits";
import { formatDate, formatNumber, t } from "@/lib/i18n";

// More, bento ("E" on the design canvas): Ask Orbit on top, which also finds a section by name, then Tasks as the
// big dark card with what is late, Health's weekly ring and today's spending beside it, Habits' week as dots, and
// every other section as a card in three groups (body, money, life), each with its live line. A section switched off in Settings leaves all of it.
// The iPad sidebar keeps the groups.
const big = ["tasks", "health", "finance", "habits"];

export default function More() {
  const { data } = useDashboardData();
  const status = useSectionStatus();
  const { groups, pinnable } = useVisibleSections();
  const [query, setQuery] = useState("");

  // Every section that is on, once each: More's groups plus the ones that live inside Health and Finance.
  const shown = useMemo(() => {
    const all = [...groups.flatMap(([, items]) => items), ...pinnable];
    return all.filter((item, index) => all.findIndex((other) => other.key === item.key) === index);
  }, [groups, pinnable]);
  const on = (key: string) => shown.some((item) => item.key === key);

  const now = new Date();
  const summary = summarizeDashboard(data, now);
  const late = openTasks(data.tasks).filter((task) => isPastDue(task.due_at, now));
  const workoutTarget = data.profile?.weekly_workout_minutes_target ?? 150;
  const workoutDone = weeklySummary(data, now).workoutMinutes;
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  // The last seven days, oldest first: full when every habit was done that day, part-filled when some were.
  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (6 - index));
    day.setHours(23, 0, 0, 0);
    const done = completedHabitsToday(data.habits, data.habitLogs, day);
    return { key: index, letter: formatDate(day, { weekday: "narrow" }), fill: done && done >= data.habits.length ? colors.accent : done ? colors.accentWash : colors.surfaceInset };
  });

  const words = query.trim();
  const matches = words ? shown.filter((item) => item.key !== "ask" && item.label.toLowerCase().includes(words.toLowerCase())) : [];
  const ask = () => words && router.push({ pathname: "/ask", params: { q: words } } as Href);

  const tasksCard = on("tasks") ? (
    <Link href="/tasks" asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${t.tasks}, ${status.tasks?.value ?? ""} ${status.tasks?.caption ?? ""}`} style={styles.lead}>
        <View style={styles.spread}>
          <Text style={styles.leadTitle}>{t.tasks}</Text>
          {summary.todayTaskCount ? <Text style={styles.leadSide}>{mt.today(formatNumber(summary.todayTaskCount))}</Text> : null}
        </View>
        <View style={{ gap: 2 }}>
          {status.tasks?.value ? <Text style={styles.leadValue}>{status.tasks.value}</Text> : <Icon name="check" size={36} color={colors.urgentInk} />}
          <Text style={styles.leadSide}>{status.tasks?.caption}</Text>
        </View>
        {late[0] ? (
          <View style={styles.leadFoot}>
            <Text style={styles.leadTask} numberOfLines={1}>
              {late[0].title}
            </Text>
            {late[0].due_at ? <Text style={styles.leadDue}>{formatDate(late[0].due_at, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </Link>
  ) : null;

  const healthCard = on("health") ? (
    <Link key="health" href="/health" asChild>
      <Pressable accessibilityRole="link" style={styles.health}>
        <RingGauge value={Math.min(1, workoutDone / workoutTarget)} size={52} thickness={6} track={colors.accentWash} hole={colors.accentTint} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>{t.health}</Text>
          <Text style={[styles.line, { color: colors.accentTintInk }]} numberOfLines={3}>
            {workoutDone >= workoutTarget ? mt.targetMet : mt.minLeft(formatNumber(workoutTarget - workoutDone))}
          </Text>
        </View>
      </Pressable>
    </Link>
  ) : null;

  const financeCard = on("finance") ? (
    <Link key="finance" href="/finance" asChild>
      <Pressable accessibilityRole="link" style={styles.finance}>
        <View style={styles.spread}>
          <Text style={styles.title}>{t.finance}</Text>
          <IconTile name="credit-card" size={30} tone="accent" />
        </View>
        <View>
          <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(summary.todaySpending, currency)}
          </Text>
          <Text style={[styles.line, status.finance?.alert && { color: colors.link }]}>{status.finance?.alert ? status.finance.caption : mt.spentToday}</Text>
        </View>
      </Pressable>
    </Link>
  ) : null;

  const side = [healthCard, financeCard].filter(Boolean);
  // Every other section, in three groups, each card with its live line.
  const rest = shown.filter((item) => !big.includes(item.key) && item.key !== "ask" && item.key !== "settings");
  const inside = (list: Section[]) => rest.filter((item) => list.some((other) => other.key === item.key));
  const tileGroups: [string, Section[]][] = [
    [mt.bodyGroup, inside(insideHealth)],
    [mt.moneyGroup, inside(insideFinance)],
    [mt.lifeGroup, rest.filter((item) => !insideHealth.concat(insideFinance).some((other) => other.key === item.key))]
  ];

  return (
    <Screen header={<TabHeader title={t.more} action={<HeaderButton icon="settings" label={t.settings} onPress={() => router.push("/settings")} />} />}>
      <View style={styles.search}>
        <Icon name={on("ask") ? "message-circle" : "search"} size={18} color={colors.link} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={on("ask") ? mt.searchAsk : mt.searchPh}
          placeholderTextColor={colors.inkFaint}
          selectionColor={colors.accentDeep}
          returnKeyType={on("ask") ? "send" : "search"}
          onSubmitEditing={() => on("ask") && ask()}
          accessibilityLabel={on("ask") ? mt.searchAsk : mt.searchPh}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel={t.cancel} hitSlop={10}>
            <Icon name="x" size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {words ? (
        <Card list>
          {matches.map((item, index) => (
            <ListRow key={item.key} first={index === 0} leading={<IconTile name={item.icon} />} title={item.label} href={item.href} chevron />
          ))}
          {on("ask") ? <ListRow first={!matches.length} leading={<IconTile name="message-circle" tone="accent" />} title={mt.askThis(words)} onPress={ask} chevron /> : null}
          {!matches.length && !on("ask") ? <ListRow first title={mt.noMatch} /> : null}
        </Card>
      ) : (
        <>
          {tasksCard || side.length ? (
            <View style={styles.row}>
              {tasksCard}
              {side.length ? <View style={styles.column}>{side}</View> : null}
            </View>
          ) : null}
          {on("habits") ? (
            <Link href="/habits" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`${t.habits}, ${status.habits?.caption ?? ""}`} style={styles.habits}>
                <View style={styles.spread}>
                  <Text style={styles.title}>{t.habits}</Text>
                  <Text style={styles.line}>{status.habits?.caption ?? mt.thisWeek}</Text>
                </View>
                <View style={styles.week}>
                  {week.map((day) => (
                    <View key={day.key} style={styles.day}>
                      <View style={[styles.dot, { backgroundColor: day.fill }]} />
                      <Text style={styles.dayLetter}>{day.letter}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            </Link>
          ) : null}
          {tileGroups.map(([label, items]) =>
            items.length ? (
              <View key={label} style={{ gap: 8 }}>
                <GroupHeader label={label} />
                <BentoGrid>
                  {items.map((item) => (
                    <BentoTile key={item.key} icon={item.icon} title={item.label} detail={status[item.key]?.caption} alert={status[item.key]?.alert} href={item.href} />
                  ))}
                </BentoGrid>
              </View>
            ) : null
          )}
        </>
      )}
    </Screen>
  );
}

// Link's Slot takes one style object, not an array, so every linked card has its own entry.
const card = { borderRadius: 24, borderCurve: "continuous" } as const;
const plain = { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline } as const;

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, paddingHorizontal: 16, ...plain, borderColor: colors.accentLine, borderRadius: radius.pill },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  row: { flexDirection: "row", gap: 10 },
  column: { flex: 1, flexBasis: 0, gap: 10 },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  // Tasks: the inverted card, dark on the day ground and pale at night.
  lead: { ...card, flex: 1, flexBasis: 0, minWidth: 0, minHeight: 236, justifyContent: "space-between", gap: 12, padding: 16, backgroundColor: colors.urgent },
  leadTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.urgentInk },
  leadSide: { fontFamily: fonts.medium, fontSize: 12, color: colors.urgentInk, opacity: 0.7 },
  leadValue: { fontFamily: fonts.bold, fontSize: 56, lineHeight: 60, color: colors.urgentInk },
  leadFoot: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.edge },
  leadTask: { fontFamily: fonts.semibold, fontSize: 12, color: colors.urgentInk },
  leadDue: { fontFamily: fonts.regular, fontSize: 11, color: colors.urgentInk, opacity: 0.6 },
  health: { ...card, flex: 1, minHeight: 113, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.accentTint },
  finance: { ...card, ...plain, flex: 1, minHeight: 113, padding: 14, justifyContent: "space-between" },
  habits: { ...card, ...plain, gap: 12, padding: 14 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  line: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: colors.inkMuted },
  number: { fontFamily: fonts.bold, fontSize: 24, color: colors.ink },
  week: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", gap: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.hairline },
  dayLetter: { fontFamily: fonts.medium, fontSize: 10, color: colors.inkMuted }
});
