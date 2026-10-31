import { Text, View } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Screen, Stats, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { averageMood, journalEntriesInLastDays, todayEntry } from "@/lib/journal";

export default function Journal() {
  const { data, loading, refresh } = useDashboardData();

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      <Stats
        items={[
          ["Today", todayEntry(data.journalEntries) ? "Written" : "Not yet"],
          ["7-day mood", averageMood(journalEntriesInLastDays(data.journalEntries, 7)) || "-"],
          ["Entries", data.journalEntries.length]
        ]}
      />
      {!data.journalEntries.length ? <Empty>Write one: "journal good today was calm".</Empty> : null}
      {data.journalEntries.map((entry) => (
        <View key={entry.id} style={ui.card}>
          <Text style={ui.label}>
            {entry.entry_date} · {entry.mood}
          </Text>
          {entry.title ? <Text style={ui.strong}>{entry.title}</Text> : null}
          <Text style={ui.body}>{entry.body}</Text>
        </View>
      ))}
    </Screen>
  );
}
