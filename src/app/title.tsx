import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { Badge, EmptyState, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSeerr } from "@/hooks/use-seerr";
import { useWatchlist } from "@/hooks/use-watchlist";
import { t } from "@/lib/i18n";
import { posterUrl, seerrTitle, type SeerrDetails, type SeerrMediaType } from "@/lib/seerr";
import type { WatchStatus } from "@/lib/types";
import { watchDraftFromSeerr } from "@/lib/watchlist";

// One movie or series from Seerr: poster, facts, story, and what you can do with it. Opened from Movies & TV.
export default function Title() {
  const params = useLocalSearchParams<{ kind: SeerrMediaType; id: string }>();
  const seerr = useSeerr();
  const { userId } = useDashboardData();
  const watchlist = useWatchlist(userId);
  const [item, setItem] = useState<SeerrDetails | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const tmdbId = Number(params.id);

  const load = useCallback(async () => {
    if (!seerr.client) return;
    try {
      setItem(await seerr.client.details(params.kind, tmdbId));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t.tryAgain);
    }
  }, [seerr.client, params.kind, tmdbId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    }
  };

  if (!item) return <View style={{ flex: 1, padding: 20 }}><EmptyState>{failed ?? (seerr.ready && !seerr.connected ? t.seerrConnect : `${t.loading}…`)}</EmptyState></View>;

  const onList = watchlist.items.find((row) => row.tmdb_id === tmdbId && row.media_type === params.kind);
  const status = item.mediaInfo?.status;
  const poster = posterUrl(item.posterPath, 342);
  const facts = [
    params.kind === "tv" ? t.series : t.movie,
    item.runtime ? `${item.runtime} ${t.minutesShort}` : null,
    item.numberOfSeasons ? `${item.numberOfSeasons} ${t.seasonsShort}` : null,
    item.voteAverage ? `★ ${item.voteAverage.toFixed(1)}` : null
  ].filter(Boolean);
  const setStatus = (next: WatchStatus) => act(() => (onList ? watchlist.update(onList.id, { status: next }) : watchlist.save(watchDraftFromSeerr(item, next)!)));
  const listChoices: [WatchStatus, string][] = [["want", t.wantToWatch], ["watching", t.watching], ["done", t.watched]];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 16 }}>
        {poster ? <Image source={{ uri: poster }} style={{ width: 110, height: 165, borderRadius: radius.chip }} accessibilityIgnoresInvertColors /> : null}
        <View style={{ flex: 1, gap: 8, justifyContent: "center" }}>
          <Text style={type.title}>{seerrTitle(item)}</Text>
          <Text style={type.rowSubtitle}>{facts.join(" · ")}</Text>
          {item.genres?.length ? <Text style={type.rowSubtitle}>{item.genres.map((genre) => genre.name).join("، ")}</Text> : null}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {status === 5 ? <Badge tone="success" glyph="✓">{t.available}</Badge> : null}
            {status && status > 1 && status !== 5 ? <Badge glyph="◷">{t.requested}</Badge> : null}
          </View>
        </View>
      </View>
      {item.tagline ? <Text style={[type.rowSubtitle, { fontStyle: "italic" }]}>{item.tagline}</Text> : null}
      {item.overview ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{item.overview}</Text> : null}
      {!status || status === 1 ? <Button variant="primary" title={t.request} onPress={() => act(() => seerr.client!.request(params.kind, tmdbId))} /> : null}
      {watchlist.available ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {listChoices.map(([value, label]) => (
            <View key={value} style={{ flex: 1 }}>
              <Button variant={onList?.status === value ? "dark" : "outline"} title={label} onPress={() => void setStatus(value)} />
            </View>
          ))}
        </View>
      ) : null}
      {onList ? <Button variant="outline" title={t.remove} onPress={() => act(() => watchlist.remove(onList.id))} /> : null}
    </ScrollView>
  );
}
