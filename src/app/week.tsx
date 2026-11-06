import { Text } from "react-native";
import { Card, CardLink, type } from "@/components/drift";
import { Button, Loading, Screen } from "@/components/screen";
import { factsOf, WeekFactsGrid, weekRange, WeekWritten } from "@/components/weekly-summary";
import { useWeeklySummary } from "@/hooks/use-weekly-summary";
import { t } from "@/lib/i18n";

// The latest week (Saturday to Friday): its numbers, then the AI's look back and plan for the coming week. Opened from
// the Friday card on Today and from the assistant. The written part is kept on the phone for the week.
export default function Week() {
  const { state, refresh } = useWeeklySummary();
  const facts = factsOf(state);
  const busy = state.status === "loading";

  return (
    <Screen title={t.weekSummary} refreshing={busy && facts !== null} onRefresh={() => void refresh()}>
      {facts ? <Text style={type.rowSubtitle}>{`${weekRange(facts)} · ${t.weekFridayHint}`}</Text> : null}
      {facts ? <WeekFactsGrid facts={facts} /> : <Loading />}
      <Card
        title={t.weekSummary}
        action={state.status === "no-ai" ? <CardLink href="/integrations" label={t.morningBriefConnect} /> : state.status === "consent" ? <CardLink href="/ask" label={t.morningBriefAllow} /> : undefined}
      >
        <WeekWritten state={state} retry={() => void refresh()} />
      </Card>
      {state.status === "ready" ? <Button variant="outline" title={t.weekRefresh} disabled={busy} onPress={() => void refresh()} /> : null}
    </Screen>
  );
}
