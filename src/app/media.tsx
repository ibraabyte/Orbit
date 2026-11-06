import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Text, View } from "react-native";
import { Card, EmptyState, ListRow, RowButton, StatGrid, StatTile, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { Chip, openDiscover, openTitle, Poster, PosterGrid, PosterRail, SeeAll } from "@/components/seerr-parts";
import { BleedRow, Button, Screen, SearchBar } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSeerr } from "@/hooks/use-seerr";
import { useWatchlist } from "@/hooks/use-watchlist";
import { formatDate, t } from "@/lib/i18n";
import { DISCOVER_ROWS, mt, seerrTitle, type DiscoverRow, type SeerrCounts, type SeerrMediaType, type SeerrRequest, type SeerrResult } from "@/lib/seerr";
import type { WatchItem } from "@/lib/types";
import { groupWatchItems, progressLabel } from "@/lib/watchlist";

export default function Media() {
  const seerr = useSeerr();
  if (!seerr.ready) return <Screen>{null}</Screen>;
  return seerr.connected ? <Browse seerr={seerr} /> : <Connect connect={seerr.connect} error={seerr.error} />;
}

function Connect({ connect, error }: { connect: (url: string, apiKey: string) => Promise<void>; error: string | null }) {
  return (
    <Screen>
      <Card title={t.seerrConnect} style={{ gap: 12, paddingVertical: 16 }}>
        <Text style={type.rowSubtitle}>{error ?? t.seerrHint}</Text>
        <SeerrConnectForm connect={connect} />
      </Card>
    </Screen>
  );
}

type Genre = { id: number; name: string };
type Pending = { request: SeerrRequest; title: string; posterPath?: string | null };

// Like Seerr's own Discover page: search, request counts, rows of posters, genres, then your watch list.
function Browse({ seerr }: { seerr: ReturnType<typeof useSeerr> }) {
  const client = seerr.client!;
  const { sheet } = useOverlays();
  const { userId } = useDashboardData();
  const watchlist = useWatchlist(userId);
  const lists = groupWatchItems(watchlist.items);
  // Opened from a saved movie in the saver: start with its title searched.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(q ?? "");
  const [search, setSearch] = useState<{ text: string; page: number; pages: number; results: SeerrResult[] } | null>(null);
  const [rows, setRows] = useState<Partial<Record<DiscoverRow, SeerrResult[]>>>({});
  const [genres, setGenres] = useState<{ movie: Genre[]; tv: Genre[] }>({ movie: [], tv: [] });
  const [counts, setCounts] = useState<SeerrCounts | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async (text: string, page = 1) => {
    if (!text.trim()) return setSearch(null);
    setLoading(true);
    try {
      const body = await client.searchPage(text.trim(), page);
      setSearch((before) => ({ text: text.trim(), page: body.page, pages: body.totalPages, results: page > 1 && before ? [...before.results, ...body.results] : body.results }));
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  // Each row loads on its own, so one slow or missing list doesn't hold up the rest.
  const loadDiscover = async () => {
    setLoading(true);
    const quiet = <T,>(work: Promise<T>) => work.catch(() => null);
    await Promise.all([
      ...DISCOVER_ROWS.map((row) => quiet(client.discover({ row }).then((body) => setRows((before) => ({ ...before, [row]: body.results }))))),
      quiet(Promise.all([client.genres("movie"), client.genres("tv")]).then(([movie, tv]) => setGenres({ movie, tv }))),
      quiet(client.counts().then(setCounts)),
      seerr.isAdmin
        ? quiet(
            client.requests(10, "pending").then(async (requests) =>
              setPending(
                await Promise.all(
                  requests.map(async (request) => {
                    const item = await client.details(request.type, request.media.tmdbId).catch(() => null);
                    return { request, title: item ? seerrTitle(item) : request.type === "tv" ? mt.series : mt.movie, posterPath: item?.posterPath };
                  })
                )
              )
            )
          )
        : Promise.resolve()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    void loadDiscover();
    if (q) void runSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; search runs on submit
  }, [client, seerr.isAdmin]);

  // Back from a title: its request and list buttons may have changed things here.
  useFocusEffect(
    useCallback(() => {
      void watchlist.refresh();
    }, [watchlist.refresh])
  );

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadDiscover();
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    }
  };

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

  const openRequests = (filter?: string) => router.push({ pathname: "/requests", params: filter ? { filter } : {} });
  const watchRow = (item: WatchItem, trailing?: ReactNode, subtitle?: string | null) => (
    <ListRow key={item.id} leading={<Poster path={item.poster_path} title={item.title} width={36} />} title={item.title} subtitle={subtitle ?? (item.media_type === "tv" ? t.series : t.movie)} trailing={trailing} onPress={() => openTitle(item.media_type, item.tmdb_id)} />
  );

  return (
    <Screen refreshing={loading} onRefresh={() => (search ? runSearch(search.text) : loadDiscover())}>
      {seerr.error ? <EmptyState>{seerr.error}</EmptyState> : null}
      <SearchBar
        placeholder={t.searchMedia}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          if (!text.trim()) setSearch(null);
        }}
        onSubmitEditing={() => runSearch(query)}
      />
      {search ? (
        <Card title={t.results}>
          {search.results.length ? <PosterGrid items={search.results} /> : <EmptyState>{loading ? `${t.loading}…` : mt.nothingFound}</EmptyState>}
          {search.page < search.pages ? <Button variant="outline" title={mt.loadMore} disabled={loading} onPress={() => runSearch(search.text, search.page + 1)} /> : null}
        </Card>
      ) : (
        <>
          <Card title={seerr.isAdmin ? mt.allRequests : mt.myRequests} action={<SeeAll onPress={() => openRequests()} />}>
            <StatGrid columns={4}>
              {[
                <StatTile key="pending" label={mt.filters.pending} value={counts?.pending ?? "–"} alert={Boolean(seerr.isAdmin && counts?.pending)} href={{ pathname: "/requests", params: { filter: "pending" } }} />,
                <StatTile key="processing" label={mt.filters.processing} value={counts?.processing ?? "–"} href={{ pathname: "/requests", params: { filter: "processing" } }} />,
                <StatTile key="available" label={mt.filters.available} value={counts?.available ?? "–"} href={{ pathname: "/requests", params: { filter: "available" } }} />,
                <StatTile key="all" label={mt.filters.all} value={counts?.total ?? "–"} href="/requests" />
              ]}
            </StatGrid>
          </Card>
          {pending.length ? (
            <Card title={mt.awaiting} action={<SeeAll onPress={() => openRequests("pending")} />}>
              {pending.map(({ request, title, posterPath }) => (
                <ListRow
                  key={request.id}
                  leading={<Poster path={posterPath} title={title} width={36} />}
                  title={title}
                  subtitle={[request.requestedBy?.displayName, formatDate(request.createdAt)].filter(Boolean).join(" · ")}
                  onPress={() => openTitle(request.type, request.media.tmdbId)}
                  trailing={
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <RowButton icon="check" label={mt.approve} onPress={() => act(() => client.approve(request.id))} />
                      <RowButton outline icon="x" label={mt.decline} onPress={() => act(() => client.decline(request.id))} />
                    </View>
                  }
                />
              ))}
            </Card>
          ) : null}
          {DISCOVER_ROWS.map((row) => (
            <PosterRail key={row} title={mt.rows[row]} items={rows[row] ?? []} onSeeAll={() => openDiscover({ row })} empty={rows[row] ? undefined : <EmptyState>{`${t.loading}…`}</EmptyState>} />
          ))}
          {(["movie", "tv"] as SeerrMediaType[]).map((kind) =>
            genres[kind].length ? (
              <Card key={kind} title={kind === "tv" ? mt.tvGenres : mt.movieGenres}>
                <BleedRow>
                  {genres[kind].map((genre) => (
                    <Chip key={genre.id} label={genre.name} onPress={() => openDiscover({ row: "genre", kind, genreId: genre.id }, genre.name)} />
                  ))}
                </BleedRow>
              </Card>
            ) : null
          )}
        </>
      )}
      {lists.watching.length ? <Card title={t.watching}>{lists.watching.map((item) => watchRow(item, <RowButton label={t.nextEp} onPress={() => watched(item)} />, progressLabel(item)))}</Card> : null}
      {lists.want.length ? <Card title={t.wantToWatch}>{lists.want.map((item) => watchRow(item, <RowButton outline label={t.remove} onPress={() => act(() => watchlist.remove(item.id))} />))}</Card> : null}
      {lists.done.length ? <Card title={t.watched}>{lists.done.map((item) => watchRow(item))}</Card> : null}
      {!watchlist.available ? <EmptyState>{t.error}</EmptyState> : null}
      <Button variant="outline" title={mt.disconnectSeerr} onPress={() => sheet({ title: mt.disconnectSeerr, detail: seerr.serverUrl ?? undefined, options: [{ label: t.disconnect, destructive: true, run: () => void seerr.disconnect() }] })} />
    </Screen>
  );
}
