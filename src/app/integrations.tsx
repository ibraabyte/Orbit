import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text } from "react-native";
import { Badge, Card, IconTile, ListRow, type } from "@/components/drift";
import { Button, Empty, Loading, Screen } from "@/components/screen";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { useSeerr } from "@/hooks/use-seerr";
import { getApi } from "@/lib/backend";
import { aiState, integrationsApi, seerrState, whoopState, type IntegrationsOverview } from "@/lib/integrations";

// Every connection, set up here by you for your account only. No server settings to touch.
export default function Integrations() {
  const seerr = useSeerr();
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await integrationsApi.overview(getApi()));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  // Coming back from the WHOOP screen should show the new state.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!overview) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {loading ? <Loading /> : <Empty>{error ?? "Couldn't load your connections. Pull to try again."}</Empty>}
      </Screen>
    );
  }

  const whoop = whoopState(overview.whoop);
  const seerrNow = seerrState(seerr.status ?? overview.seerr);
  const ai = aiState(overview.ai);

  const disconnectSeerr = () =>
    Alert.alert("Disconnect Seerr?", "Orbit forgets the address and key. Your watch list stays.", [
      { text: "Disconnect", style: "destructive", onPress: () => void seerr.disconnect().then(load) },
      { text: "Cancel", style: "cancel" }
    ]);

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={[type.meta, { paddingHorizontal: 4 }]}>Each connection is yours only. Keys are kept encrypted on your Orbit server.</Text>

      <Card title="WHOOP" kicker="Recovery, sleep and strain">
        <ListRow
          leading={<IconTile name="watch" />}
          title={overview.whoop.connected ? "Open WHOOP" : "Connect WHOOP"}
          subtitle={whoop.detail}
          trailing={<Badge tone={whoop.tone}>{whoop.label}</Badge>}
          href={overview.whoop.configured ? "/whoop" : undefined}
          chevron={overview.whoop.configured}
        />
      </Card>

      <Card title="Seerr" kicker="Search and request movies and TV on your media server">
        <ListRow leading={<IconTile name="film" />} title={seerr.connected ? "Your Seerr server" : "Not connected"} subtitle={seerrNow.detail} trailing={<Badge tone={seerrNow.tone}>{seerrNow.label}</Badge>} />
        {seerr.error ? <Text style={type.meta}>{seerr.error}</Text> : null}
        {!seerr.ready ? (
          <Loading />
        ) : seerr.connected ? (
          <>
            <ListRow leading={<IconTile name="search" />} title="Open Movies & TV" href="/media" chevron />
            <Button variant="secondary" title="Disconnect Seerr" onPress={disconnectSeerr} />
          </>
        ) : (
          <SeerrConnectForm connect={(url, key) => seerr.connect(url, key).then(load)} />
        )}
      </Card>

      <Card title="AI summaries" kicker="Provided by the server for everyone on it">
        <ListRow leading={<IconTile name="feather" />} title="Written summaries" subtitle={ai.detail} trailing={<Badge tone={ai.tone}>{ai.label}</Badge>} />
      </Card>
    </Screen>
  );
}
