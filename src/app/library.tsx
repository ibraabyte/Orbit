import { useState } from "react";
import { Linking } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Input, Row, Screen, Stats } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { captureNeedsTriage, captureSearchFields, captureSourceLabel, captureStats } from "@/lib/library";

// Library + the old Inbox: captures without a note or tag are marked to sort.
export default function Library() {
  const { data, loading, refresh } = useDashboardData();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const captures = needle ? data.captures.filter((capture) => captureSearchFields(capture, data.attachments).some((field) => field.toLowerCase().includes(needle))) : data.captures;
  const stats = captureStats(data.captures, data.attachments, data.taggings);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      <Stats items={[["Saved", stats.total], ["Links", stats.links], ["To sort", stats.needsTriage]]} />
      <Input placeholder="Search saved items" value={query} onChangeText={setQuery} clearButtonMode="while-editing" />
      {!captures.length ? <Empty>Nothing saved yet. Paste a link in the bar above.</Empty> : null}
      {captures.map((capture) => (
        <Row
          key={capture.id}
          title={capture.title}
          detail={[captureSourceLabel(capture), capture.note].filter(Boolean).join(" · ")}
          tone={captureNeedsTriage(capture, data.taggings) ? "warning" : undefined}
          onPress={capture.url ? () => Linking.openURL(capture.url!) : undefined}
        />
      ))}
    </Screen>
  );
}
