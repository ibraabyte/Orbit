import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Badge, Card, EmptyState, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen, SearchBar } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSeerr } from "@/hooks/use-seerr";
import { useWatchlist } from "@/hooks/use-watchlist";
import { formatDate, t } from "@/lib/i18n";
import { seerrTitle, type SeerrRequest, type SeerrResult } from "@/lib/seerr";
import type { WatchItem } from "@/lib/types";
import { groupWatchItems, progressLabel, watchDraftFromSeerr } from "@/lib/watchlist";

// ponytail: a colored block until real poster images are wired in.
function Poster({ seed }: { seed: string }) {
  const tones = [colors.urgent, colors.sage, colors.accentDeep, colors.inkMuted];
  return <View style={{ width: 36, height: 52, borderRadius: radius.chip, backgroundColor: tones[seed.length % tones.length] }} />;
}

export default function Media() {
  const seerr = useSeerr();
  if (!seerr.ready) return <Screen>{null}</Screen>;
  return seerr.connected ? <Browse seerr={seerr} /> : <Connect connect={seerr.connect} />;
}

function Connect({ connect }: { connect: (url: string, apiKey: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <Card title={t.seerrConnect} style={{ gap: 12, paddingVertical: 16 }}>
        <Text style={type.rowSubtitle}>{t.seerrHint}</Text>
        <Input accessibilityLabel={t.serverUrl} placeholder="https://seerr.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ writingDirection: "ltr" }} />
        <Input accessibilityLabel={t.apiKey} placeholder={t.apiKey} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
        <Button
          title={busy ? `${t.connecting}` : t.connect}
          disabled={busy || !url.trim() || !key.trim()}
          onPress={async () => {
            setBusy(true);
            try {
              await connect(url, key);
            } catch (error) {
              Alert.alert(t.seerrConnect, error instanceof Error ? error.message : t.tryAgain);
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </Screen>
  );
}

function Browse({ seerr }: { seerr: ReturnType<typeof useSeerr> }) {
  const client = seerr.client!;
  const { sheet } = useOverlays();
  const { userId } = useDashboardData();
  const watchlist = useWatchlist(userId);
  const lists = groupWatchItems(watchlist.items);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SeerrResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState<{ request: SeerrRequest; title: string | null }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (text = query) => {
    setLoading(true);
    try {
      setResults(text.trim() ? await client.search(text.trim()) : await client.trending());
      setSearched(Boolean(text.trim()));
      if (seerr.isAdmin) {
        const requests = await client.requests(20, "pending");
        setPending(await Promise.all(requests.map(async (request) => ({ request, title: await client.details(request.type, request.media.tmdbId).then(seerrTitle).catch(() => null) }))));
      }
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; search runs on submit
  }, [client, seerr.isAdmin]);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    }
  };

  // ⋯ on a title: request it on the server and/or put it on your watch list.
  const addToList = (item: SeerrResult) =>
    sheet({
      title: seerrTitle(item),
      options: [
        { label: t.wantToWatch, run: () => void act(() => watchlist.save(watchDraftFromSeerr(item, "want")!)) },
        { label: t.watching, run: () => void act(() => watchlist.save(watchDraftFromSeerr(item, "watching")!)) }
      ]
    });

  const watched = (item: WatchItem) =>
    sheet({
      title: item.title,
      detail: progressLabel(item) ?? undefined,
      options: [
        ...(item.media_type === "tv"
          ? [
              { label: t.nextEp, run: () => void act(() => watchlist.watchedOne(item)) },
              { label: t.nextSeason, run: () => void act(() => watchlist.watchedOne(item, true)) }
            ]
          : []),
        { label: t.finished, run: () => void act(() => watchlist.update(item.id, { status: "done" })) },
        { label: t.remove, destructive: true, run: () => void act(() => watchlist.remove(item.id)) }
      ]
    });

  return (
    <Screen refreshing={loading} onRefresh={() => load()}>
      {seerr.error ? <EmptyState>{seerr.error}</EmptyState> : null}
      <SearchBar placeholder={t.searchMedia} value={query} onChangeText={setQuery} onSubmitEditing={() => load()} />
      <Card title={searched ? t.results : t.trending}>
        {results.length ? (
          results.map((item) => {
            const status = item.mediaInfo?.status;
            const requestable = !status || status === 1;
            const draft = watchDraftFromSeerr(item);
            return (
              <ListRow
                key={`${item.mediaType}-${item.id}`}
                leading={<Poster seed={seerrTitle(item)} />}
                title={seerrTitle(item)}
                subtitle={item.mediaType === "tv" ? t.series : t.movie}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {status === 5 ? <Badge tone="success" glyph="✓">{t.available}</Badge> : null}
                    {status && status > 1 && status !== 5 ? <Badge glyph="◷">{t.requested}</Badge> : null}
                    {requestable && draft ? <RowButton label={t.request} onPress={() => act(() => client.request(draft.media_type, item.id))} /> : null}
                    {watchlist.available && draft ? <RowButton outline icon="plus" label={t.wantToWatch} onPress={() => addToList(item)} /> : null}
                  </View>
                }
              />
            );
          })
        ) : (
          <EmptyState>{loading ? `${t.loading}…` : t.emptyEx}</EmptyState>
        )}
      </Card>
      {lists.watching.length ? (
        <Card title={t.watching}>
          {lists.watching.map((item) => (
            <ListRow key={item.id} leading={<Poster seed={item.title} />} title={item.title} subtitle={progressLabel(item)} trailing={<Badge tone="accent" glyph="▶">{t.nextEp}</Badge>} onPress={() => watched(item)} />
          ))}
        </Card>
      ) : null}
      {lists.want.length ? (
        <Card title={t.wantToWatch}>
          {lists.want.map((item) => (
            <ListRow key={item.id} leading={<Poster seed={item.title} />} title={item.title} subtitle={item.media_type === "tv" ? t.series : t.movie} trailing={<RowButton outline label={t.remove} onPress={() => act(() => watchlist.remove(item.id))} />} onPress={() => watched(item)} />
          ))}
        </Card>
      ) : null}
      {!watchlist.available ? <EmptyState>{t.error}</EmptyState> : null}
      {pending.length ? (
        <Card title={t.pending} style={{ backgroundColor: colors.accentTint, borderColor: colors.accentTint }}>
          {pending.map(({ request, title }) => (
            <ListRow
              key={request.id}
              title={title ?? (request.type === "tv" ? t.series : t.movie)}
              subtitle={`${request.requestedBy?.displayName ?? ""} · ${formatDate(request.createdAt)}`}
              trailing={
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <RowButton label={`✓ ${t.approve}`} onPress={() => act(() => client.approve(request.id))} />
                  <RowButton outline label={t.decline} onPress={() => act(() => client.decline(request.id))} />
                </View>
              }
            />
          ))}
        </Card>
      ) : null}
      <Button variant="outline" title={`${t.disconnect} Seerr`} onPress={() => sheet({ title: `${t.disconnect} Seerr`, detail: seerr.serverUrl ?? undefined, options: [{ label: t.disconnect, destructive: true, run: () => void seerr.disconnect() }] })} />
    </Screen>
  );
}
