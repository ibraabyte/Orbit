import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Button, StyleSheet, TextInput, View } from "react-native";
import { Empty, Row, Screen, Section, ui } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { MEDIA_STATUS, REQUEST_STATUS, seerrTitle, type SeerrRequest, type SeerrResult } from "@/lib/seerr";

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
      <Empty>Connect your Seerr server once. The key stays on this phone.</Empty>
      <TextInput style={styles.input} placeholder="https://seerr.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <TextInput style={styles.input} placeholder="API key (Seerr → Settings → General)" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />
      <Button
        title={busy ? "Checking…" : "Connect"}
        disabled={busy || !url.trim() || !key.trim()}
        onPress={async () => {
          setBusy(true);
          try {
            await connect(url, key);
          } catch (error) {
            Alert.alert("Could not connect", error instanceof Error ? error.message : "Check the URL and key.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}

function Browse({ seerr }: { seerr: ReturnType<typeof useSeerr> }) {
  const client = seerr.client!;
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

  return (
    <Screen refreshing={loading} onRefresh={() => load()}>
      {seerr.error ? <Empty>{seerr.error}</Empty> : null}
      <TextInput style={styles.input} placeholder="Search movies & TV" value={query} onChangeText={setQuery} onSubmitEditing={() => load()} returnKeyType="search" clearButtonMode="while-editing" />
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
                right={requestable ? "Request" : undefined}
                onPress={requestable && item.mediaType !== "person" ? () => act(() => client.request(item.mediaType as "movie" | "tv", item.id)) : undefined}
              />
            );
          })
        ) : (
          <Empty>{loading ? "Loading…" : "Nothing found."}</Empty>
        )}
      </Section>
      <View style={ui.card}>
        <Button title={`Disconnect ${seerr.serverUrl ?? ""}`} color="#c0392b" onPress={() => seerr.disconnect()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 14, fontSize: 17 }
});
