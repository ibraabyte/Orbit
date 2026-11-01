import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { Button, Empty, Input, Row, Screen, Section } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSeerr } from "@/hooks/use-seerr";
import { useWatchlist } from "@/hooks/use-watchlist";
import { MEDIA_STATUS, REQUEST_STATUS, seerrTitle, type SeerrRequest, type SeerrResult } from "@/lib/seerr";
import type { WatchItem } from "@/lib/types";
import { groupWatchItems, progressLabel, watchDraftFromSeerr } from "@/lib/watchlist";

export default function Media() {
  const seerr = useSeerr();
  if (!seerr.ready) return <Screen>{null}</Screen>;
  return seerr.connected ? <Browse seerr={seerr} /> : <Connect connect={seerr.connect} error={seerr.error} />;
}

function Connect({ connect, error }: { connect: (url: string, apiKey: string) => Promise<void>; error: string | null }) {
  return (
    <Screen>
      {error ? <Empty>{error}</Empty> : null}
      <Empty>Connect your Seerr server once. Orbit keeps the key encrypted on its server, for your account only.</Empty>
      <SeerrConnectForm connect={connect} />
    </Screen>
  );
}

function Browse({ seerr }: { seerr: ReturnType<typeof useSeerr> }) {
  const client = seerr.client!;
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
      Alert.alert("Seerr", error instanceof Error ? error.message : "Try again.");
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
      Alert.alert("Seerr", error instanceof Error ? error.message : "Try again.");
    }
  };

  // One tap on a title: request it on the server and/or put it on your watch list.
  const pick = (item: SeerrResult, requestable: boolean) => {
    const draft = watchDraftFromSeerr(item);
    if (!draft) return;
    const add = (status: WatchItem["status"]) => act(() => watchlist.save(watchDraftFromSeerr(item, status)!));
    Alert.alert(seerrTitle(item), undefined, [
      ...(requestable ? [{ text: "Request on server", onPress: () => act(() => client.request(draft.media_type, item.id)) }] : []),
      ...(watchlist.available
        ? [
            { text: "Want to watch", onPress: () => add("want") },
            { text: "Watching now", onPress: () => add("watching") }
          ]
        : []),
      { text: "Cancel", style: "cancel" as const }
    ]);
  };

  const watched = (item: WatchItem) =>
    Alert.alert(item.title, progressLabel(item) ?? undefined, [
      ...(item.media_type === "tv"
        ? [
            { text: "Watched next episode", onPress: () => act(() => watchlist.watchedOne(item)) },
            { text: "Start next season", onPress: () => act(() => watchlist.watchedOne(item, true)) }
          ]
        : []),
      { text: "Finished", onPress: () => act(() => watchlist.update(item.id, { status: "done" })) },
      { text: "Remove", style: "destructive" as const, onPress: () => act(() => watchlist.remove(item.id)) },
      { text: "Cancel", style: "cancel" as const }
    ]);

  return (
    <Screen refreshing={loading} onRefresh={() => load()}>
      {seerr.error ? <Empty>{seerr.error}</Empty> : null}
      <Input placeholder="Search movies & TV" value={query} onChangeText={setQuery} onSubmitEditing={() => load()} returnKeyType="search" clearButtonMode="while-editing" />
      {pending.length ? (
        <Section title="Waiting for your approval">
          {pending.map(({ request, title }) => (
            <Row
              key={request.id}
              title={title ?? `${request.type === "tv" ? "Series" : "Movie"} request`}
              detail={`${request.requestedBy?.displayName ?? "Someone"} · ${new Date(request.createdAt).toLocaleDateString()}`}
              tone="warning"
              right="Review"
              onPress={() =>
                Alert.alert(title ?? "Request", REQUEST_STATUS[request.status], [
                  { text: "Approve", onPress: () => act(() => client.approve(request.id)) },
                  { text: "Decline", style: "destructive", onPress: () => act(() => client.decline(request.id)) },
                  { text: "Cancel", style: "cancel" }
                ])
              }
            />
          ))}
        </Section>
      ) : null}
      {lists.watching.length ? (
        <Section title="Watching">
          {lists.watching.map((item) => (
            <Row key={item.id} title={item.title} detail={progressLabel(item)} tone="success" right="Update" onPress={() => watched(item)} />
          ))}
        </Section>
      ) : null}
      {lists.want.length ? (
        <Section title="Want to watch">
          {lists.want.map((item) => (
            <Row key={item.id} title={item.title} detail={item.media_type === "tv" ? "Series" : "Movie"} onPress={() => watched(item)} />
          ))}
        </Section>
      ) : null}
      {!watchlist.available ? <Empty>Your watch list could not be loaded. Check your connection, then pull to refresh.</Empty> : null}
      <Section title={searched ? "Results" : "Trending"}>
        {results.length ? (
          results.map((item) => {
            const status = item.mediaInfo?.status;
            const requestable = !status || status === 1;
            return (
              <Row
                key={`${item.mediaType}-${item.id}`}
                title={seerrTitle(item)}
                detail={`${item.mediaType === "tv" ? "Series" : "Movie"}${status && status > 1 ? ` · ${MEDIA_STATUS[status]}` : ""}`}
                tone={status === 5 ? "success" : status && status > 1 ? "warning" : undefined}
                right={requestable ? "Request" : "Add"}
                onPress={() => pick(item, requestable)}
              />
            );
          })
        ) : (
          <Empty>{loading ? "Loading…" : "Nothing found."}</Empty>
        )}
      </Section>
      <Button variant="danger" title={`Disconnect ${seerr.serverUrl ?? ""}`} onPress={() => seerr.disconnect()} />
    </Screen>
  );
}
