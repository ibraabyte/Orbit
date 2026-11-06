import { Text, View } from "react-native";
import { Card, CardLink, StatGrid, StatTile, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { colors } from "@/components/theme";
import type { WeekState } from "@/hooks/use-weekly-summary";
import { formatMoney } from "@/lib/finance";
import { digits, formatDate, formatNumber, t } from "@/lib/i18n";
import { spendChange, type WeekFacts } from "@/lib/weekly-summary";

export const factsOf = (state: WeekState): WeekFacts | null => (state.status === "ready" ? state.reply.facts : state.facts);

// "31 Oct – 6 Nov". Dates are local keys; noon keeps them on the same day in every zone.
export const weekRange = (facts: WeekFacts) =>
  t.weekRange.replace("{from}", formatDate(`${facts.start}T12:00:00`)).replace("{to}", formatDate(`${facts.end}T12:00:00`));

/** The week's numbers, straight from the server: they never pass through the AI. Areas with no data are left out. */
export function WeekFactsGrid({ facts }: { facts: WeekFacts }) {
  const tiles = [
    <StatTile key="done" label={t.weekDone} value={formatNumber(facts.tasks_done)} />,
    <StatTile key="late" label={t.weekOverdue} value={formatNumber(facts.tasks_overdue)} color={facts.tasks_overdue ? colors.dangerOnShell : colors.ink} href="/tasks" />,
    <StatTile key="next" label={t.weekComing} value={formatNumber(facts.tasks_next_week)} href="/tasks" />
  ];
  if (facts.workouts || facts.workout_minutes)
    tiles.push(<StatTile key="workouts" label={t.weekWorkouts} value={formatNumber(facts.workouts)} unit={facts.workout_minutes ? t.weekMinutes.replace("{n}", formatNumber(facts.workout_minutes)) : undefined} />);
  if (facts.recovery_avg !== null) tiles.push(<StatTile key="recovery" label={t.weekRecovery} value={`${formatNumber(Math.round(facts.recovery_avg))}%`} />);
  if (facts.sleep_hours_avg !== null) tiles.push(<StatTile key="sleep" label={t.weekSleep} value={digits(`${facts.sleep_hours_avg}h`)} />);
  if (facts.calories_avg !== null) tiles.push(<StatTile key="calories" label={t.weekCalories} value={formatNumber(facts.calories_avg)} unit={t.kcal} />);
  for (const money of facts.spent) tiles.push(<StatTile key={`spent-${money.currency}`} label={t.weekSpent} value={formatMoney(money.total, money.currency)} href="/finance" />);
  if (facts.bills_next_week) tiles.push(<StatTile key="bills" label={t.weekBills} value={formatNumber(facts.bills_next_week)} href="/finance" />);
  if (facts.saved) tiles.push(<StatTile key="saved" label={t.weekSaved} value={formatNumber(facts.saved)} href="/library" />);
  const changes = facts.spent.map((money) => spendChange(facts, money.currency)).filter((change): change is number => change !== null);
  return (
    <View style={{ gap: 8 }}>
      <StatGrid columns={3}>{tiles}</StatGrid>
      {changes.length === 1 ? <Text style={type.rowSubtitle}>{`${t.weekSpent}: ${t.weekVsLast.replace("{n}", digits(changes[0] > 0 ? `+${changes[0]}` : changes[0]))}`}</Text> : null}
    </View>
  );
}

/** The AI's look back and plan, or why there is none. compact: the Today card, which leaves the numbers to the screen. */
export function WeekWritten({ state, retry, compact }: { state: WeekState; retry: () => void; compact?: boolean }) {
  if (state.status === "loading")
    return (
      <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
        {t.weekWriting}
      </Text>
    );
  if (state.status === "no-ai") return <Text style={type.rowSubtitle}>{t.weekNoAi}</Text>;
  if (state.status === "consent") return <Text style={type.rowSubtitle}>{t.weekConsent}</Text>;
  if (state.status === "error")
    return (
      <View style={{ gap: 8 }}>
        <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
          {`${t.weekFailed} ${state.message}`.trim()}
        </Text>
        <Button variant="outline" title={t.weekRetry} onPress={retry} />
      </View>
    );
  const { summary, plan } = state.reply;
  return (
    <View style={{ gap: 10 }}>
      <Text style={type.body} numberOfLines={compact ? 5 : undefined}>
        {digits(summary)}
      </Text>
      {plan.length ? (
        <View style={{ gap: 4 }}>
          <Text style={type.tileLabel}>{t.weekPlan}</Text>
          {plan.slice(0, compact ? 3 : plan.length).map((item) => (
            <Text key={item} style={type.body}>
              {`• ${digits(item)}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** On Today, on Fridays: the written week, with a link to the full summary. */
export function WeeklySummaryCard({ state, retry }: { state: WeekState; retry: () => void }) {
  const facts = factsOf(state);
  const action =
    state.status === "no-ai" ? <CardLink href="/integrations" label={t.morningBriefConnect} /> : state.status === "consent" ? <CardLink href="/ask" label={t.morningBriefAllow} /> : <CardLink href="/week" label={t.weekOpen} />;
  return (
    <Card title={t.weekSummary} action={action}>
      {facts ? <Text style={type.rowSubtitle}>{weekRange(facts)}</Text> : null}
      <WeekWritten state={state} retry={retry} compact />
    </Card>
  );
}
