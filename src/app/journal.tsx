import { Text, View } from "react-native";
import { Badge, Card, EmptyState, StatGrid, StatTile, type } from "@/components/drift";
import { Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatDate, t } from "@/lib/i18n";
import { journalEntriesInLastDays, moodScore, todayEntry } from "@/lib/journal";

export default function Journal() {
  const { data, loading, refresh } = useDashboardData();
  const week = journalEntriesInLastDays(data.journalEntries, 7);
  const averageScore = week.length ? (week.reduce((sum, entry) => sum + moodScore(entry.mood), 0) / week.length).toFixed(1) : "–";

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <StatGrid columns={3}>
        {[
          <StatTile key="today" label={t.wroteToday} value={todayEntry(data.journalEntries) ? t.yes : t.notYet} color={colors.accentDeep} size={18} />,
          <StatTile key="mood" label={t.mood7} value={averageScore} unit="/ 5" size={18} />,
          <StatTile key="entries" label={t.entries} value={data.journalEntries.length} size={18} />
        ]}
      </StatGrid>
      {!data.journalEntries.length ? <EmptyState example="journal good today was calm">{t.emptyEx}</EmptyState> : null}
      {data.journalEntries.map((entry) => {
        const score = moodScore(entry.mood);
        return (
          <Card key={entry.id} style={{ paddingVertical: 14, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={[type.title, { flex: 1, fontSize: 16, writingDirection: "auto" }]}>{entry.title || formatDate(`${entry.entry_date}T12:00:00`, { weekday: "long" })}</Text>
              <Text style={type.rowSubtitle}>{formatDate(`${entry.entry_date}T12:00:00`)}</Text>
              <Badge tone={score >= 4 ? "accent" : score <= 2 ? "urgent" : "neutral"} glyph={score >= 4 ? "☺" : score <= 2 ? "☹" : "–"}>{`${score}/5`}</Badge>
            </View>
            <Text style={[type.body, { writingDirection: "auto", color: "#2f3f34" }]}>{entry.body}</Text>
          </Card>
        );
      })}
    </Screen>
  );
}
