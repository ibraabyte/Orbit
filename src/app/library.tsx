import { useState } from "react";
import { Linking } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, StatGrid, StatTile } from "@/components/drift";
import { Screen, SearchBar } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { t } from "@/lib/i18n";
import { captureNeedsTriage, captureSearchFields, captureSourceLabel, captureStats } from "@/lib/library";

// Links and notes; captures without a note or tag are marked to sort.
export default function Library() {
  const { data, loading, refresh } = useDashboardData();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const captures = needle ? data.captures.filter((capture) => captureSearchFields(capture, data.attachments).some((field) => field.toLowerCase().includes(needle))) : data.captures;
  const stats = captureStats(data.captures, data.attachments, data.taggings);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <StatGrid columns={3}>
        {[
          <StatTile key="saved" label={t.savedItems} value={stats.total} size={18} />,
          <StatTile key="links" label={t.links} value={stats.links} size={18} />,
          <StatTile key="sort" label={t.needsSorting} value={stats.needsTriage} color={colors.accentDeep} size={18} />
        ]}
      </StatGrid>
      <SearchBar placeholder={t.search} value={query} onChangeText={setQuery} />
      <Card>
        {!captures.length ? <EmptyState example="note idea for the weekend">{t.emptyEx}</EmptyState> : null}
        {captures.map((capture) => (
          <ListRow
            key={capture.id}
            leading={<IconTile name={capture.url ? "external-link" : "edit-3"} size={36} tone={capture.url ? "neutral" : "accent"} />}
            title={capture.title}
            subtitle={[captureSourceLabel(capture), capture.note].filter(Boolean).join(" · ")}
            badges={captureNeedsTriage(capture, data.taggings) ? <Badge tone="accent" glyph="△">{t.noTag}</Badge> : undefined}
            onPress={capture.url ? () => Linking.openURL(capture.url!) : undefined}
          />
        ))}
      </Card>
    </Screen>
  );
}
