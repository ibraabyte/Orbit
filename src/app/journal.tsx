import { Text } from "react-native";
import { Badge, Card, type } from "@/components/drift";
import { QuickAddCard } from "@/components/quick-add-bar";
import { Empty, Screen, Stats } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { averageMood, journalEntriesInLastDays, todayEntry } from "@/lib/journal";

export default function Journal() {
  const { data, loading, refresh } = useDashboardData();

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "journal good today was calm".' />
      <Stats
        items={[
          ["Today", todayEntry(data.journalEntries) ? "Written" : "Not yet", "edit-3"],
          ["7-day mood", averageMood(journalEntriesInLastDays(data.journalEntries, 7)) || "-", "smile"],
          ["Entries", data.journalEntries.length, "book-open"]
        ]}
      />
      {!data.journalEntries.length ? <Empty>Write one: "journal good today was calm".</Empty> : null}
      {data.journalEntries.map((entry) => (
        <Card key={entry.id} title={entry.title || entry.entry_date} kicker={entry.title ? entry.entry_date : undefined} action={<Badge>{entry.mood}</Badge>}>
          <Text style={type.body}>{entry.body}</Text>
        </Card>
      ))}
    </Screen>
  );
}
