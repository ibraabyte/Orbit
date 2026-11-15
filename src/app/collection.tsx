import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Card, EmptyState, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Poster, PosterGrid } from "@/components/seerr-parts";
import { Button, Screen } from "@/components/screen";
import { space } from "@/components/theme";
import { useSeerr } from "@/hooks/use-seerr";
import { t } from "@/lib/i18n";
import { collectionToRequest, mt, type SeerrCollection } from "@/lib/seerr";

// A series of films, like Seerr's collection page: what it is, every film in it, and one button to ask for the ones
// not on the server yet (one request per film, the way Seerr does it).
export default function Collection() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const collectionId = Number(id);
  const seerr = useSeerr();
  const { sheet } = useOverlays();
  const [item, setItem] = useState<SeerrCollection | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!seerr.client || !collectionId) return;
    void seerr.client
      .collection(collectionId)
      .then((next) => {
        setItem(next);
        setFailed(null);
      })
      .catch((error: Error) => setFailed(error.message));
  }, [seerr.client, collectionId]);

  useEffect(load, [load]);

  if (!item) {
    return (
      <Screen title={mt.collection}>
        <EmptyState>{failed ?? `${t.loading}…`}</EmptyState>
      </Screen>
    );
  }

  const missing = collectionToRequest(item.parts);
  const requestAll = async () => {
    const client = seerr.client;
    if (!client) return;
    setBusy(true);
    let done = 0;
    let lastError: string | null = null;
    // One at a time: Seerr checks the quota per request, so a later film can be refused once it runs out.
    for (const part of missing) {
      try {
        await client.request("movie", part.id);
        done += 1;
      } catch (error) {
        lastError = error instanceof Error ? error.message : t.tryAgain;
      }
    }
    setBusy(false);
    void Haptics.notificationAsync(done ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    Alert.alert(item.name, [mt.requestedMovies(done), done < missing.length ? lastError : null].filter(Boolean).join("\n"));
    load();
  };

  return (
    <Screen title={item.name} refreshing={false} onRefresh={load}>
      <Card style={{ gap: space.md, paddingVertical: space.lg }}>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Poster path={item.posterPath} title={item.name} width={96} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={type.rowTitle}>{item.name}</Text>
            {item.overview ? <Text style={type.rowSubtitle}>{item.overview}</Text> : null}
          </View>
        </View>
        {missing.length ? (
          <Button
            variant="primary"
            disabled={busy}
            title={busy ? `${t.loading}…` : mt.requestMovies(missing.length)}
            onPress={() => sheet({ title: mt.requestMovies(missing.length), detail: missing.map((part) => part.title ?? part.name).join(" · "), options: [{ label: mt.request, run: () => void requestAll() }] })}
          />
        ) : (
          <Text style={type.rowSubtitle}>{mt.allRequested}</Text>
        )}
      </Card>
      <PosterGrid items={item.parts} />
    </Screen>
  );
}
