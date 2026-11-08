import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { EmptyState, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Chip, openTitle, Poster, StatusPill } from "@/components/seerr-parts";
import { BleedRow, Button, Screen } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { formatDate, t } from "@/lib/i18n";
import { mediaBadge, mt, quotaLine, REQUEST_FILTERS, requestBadge, seerrTitle, type RequestFilter, type SeerrQuota, type SeerrRequest } from "@/lib/seerr";

const PAGE = 20;
type Look = { title: string; posterPath?: string | null };

// Seerr's Requests page: every request you can see (all of them for an admin), by status, with the actions you're
// allowed: approve, decline and retry for an admin, cancel for your own while it waits.
export default function Requests() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const seerr = useSeerr();
  const client = seerr.client;
  const { sheet } = useOverlays();
  const [filter, setFilter] = useState<RequestFilter>(REQUEST_FILTERS.includes(params.filter as RequestFilter) ? (params.filter as RequestFilter) : "all");
  const [items, setItems] = useState<SeerrRequest[]>([]);
  const [pages, setPages] = useState({ page: 0, pages: 1 });
  const [looks, setLooks] = useState<Record<string, Look>>({});
  const [quota, setQuota] = useState<SeerrQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const asked = useRef(new Set<string>());

  // Requests carry only a TMDB id: look up each title's name and poster once.
  const lookUp = useCallback(
    (requests: SeerrRequest[]) => {
      if (!client) return;
      for (const request of requests) {
        const key = `${request.type}-${request.media.tmdbId}`;
        if (asked.current.has(key)) continue;
        asked.current.add(key);
        void client
          .details(request.type, request.media.tmdbId)
          .then((item) => setLooks((before) => ({ ...before, [key]: { title: seerrTitle(item), posterPath: item.posterPath } })))
          .catch(() => undefined);
      }
    },
    [client]
  );

  const load = useCallback(
    async (page: number) => {
      if (!client) return;
      setLoading(true);
      try {
        const body = await client.requestPage(filter, (page - 1) * PAGE, PAGE);
        setItems((before) => (page === 1 ? body.results : [...before, ...body.results.filter((item) => !before.some((old) => old.id === item.id))]));
        setPages({ page, pages: body.pageInfo.pages });
        setFailed(null);
        lookUp(body.results);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : t.tryAgain);
      } finally {
        setLoading(false);
      }
    },
    [client, filter, lookUp]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    if (client && seerr.user) void client.quota(seerr.user.id).then(setQuota).catch(() => setQuota(null));
  }, [client, seerr.user]);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load(1);
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    }
  };

  const cancel = (request: SeerrRequest, title: string) =>
    sheet({ title: mt.cancelRequestTitle, detail: title, options: [{ label: mt.cancelRequest, destructive: true, run: () => void act(() => client!.cancel(request.id)) }] });

  const quotas = [quotaLine(quota?.movie, "movie"), quotaLine(quota?.tv, "tv")].filter(Boolean) as string[];

  return (
    <Screen title={seerr.isAdmin ? mt.allRequests : mt.myRequests} refreshing={loading && pages.page <= 1} onRefresh={() => load(1)}>
      <BleedRow>
        {REQUEST_FILTERS.map((option) => (
          <Chip key={option} label={mt.filters[option]} selected={option === filter} onPress={() => setFilter(option)} />
        ))}
      </BleedRow>
      {quotas.map((line) => (
        <Text key={line} style={type.shellMuted}>
          {line}
        </Text>
      ))}
      {failed ? <EmptyState>{failed}</EmptyState> : null}
      <View>
        {items.map((request, index) => {
          const look = looks[`${request.type}-${request.media.tmdbId}`];
          const title = look?.title ?? (request.type === "tv" ? mt.series : mt.movie);
          const mine = Boolean(seerr.user && request.requestedBy?.id === seerr.user.id);
          const seasons = request.type === "tv" && request.seasons?.length ? mt.seasonsAsked(request.seasons.map((season) => season.seasonNumber).sort((a, b) => a - b).join(mt.sep)) : null;
          const media = mediaBadge(request.media.status);
          return (
            <ListRow
              key={request.id}
              first={index === 0}
              leading={<Poster path={look?.posterPath} title={title} width={44} />}
              title={title}
              badges={
                <>
                  <StatusPill badge={requestBadge(request.status)} />
                  {request.status === 2 && media ? <StatusPill badge={media} /> : null}
                  {request.is4k ? <StatusPill badge={{ label: mt.fourK, glyph: "◆", tone: "neutral" }} /> : null}
                </>
              }
              subtitle={[seasons, seerr.isAdmin ? request.requestedBy?.displayName : null, formatDate(request.createdAt)].filter(Boolean).join(" · ")}
              onPress={() => openTitle(request.type, request.media.tmdbId)}
              trailing={
                seerr.isAdmin && request.status === 1 ? (
                  <View style={{ gap: 6 }}>
                    <RowButton icon="check" label={mt.approve} onPress={() => act(() => client!.approve(request.id))} />
                    <RowButton outline label={mt.decline} onPress={() => act(() => client!.decline(request.id))} />
                  </View>
                ) : seerr.isAdmin && request.status === 4 ? (
                  <RowButton icon="refresh-cw" label={mt.retry} onPress={() => act(() => client!.retry(request.id))} />
                ) : mine && request.status === 1 ? (
                  <RowButton outline label={t.cancel} onPress={() => cancel(request, title)} />
                ) : undefined
              }
            />
          );
        })}
      </View>
      {!items.length ? <EmptyState icon={loading || !seerr.ready ? undefined : "film"} action={loading || !seerr.ready ? undefined : { label: t.movies, onPress: () => router.push("/media") }}>{loading || !seerr.ready ? `${t.loading}…` : mt.requestsEmpty}</EmptyState> : null}
      {pages.page > 0 && pages.page < pages.pages ? <Button variant="outline" title={loading ? `${t.loading}…` : mt.loadMore} disabled={loading} onPress={() => load(pages.page + 1)} /> : null}
    </Screen>
  );
}
