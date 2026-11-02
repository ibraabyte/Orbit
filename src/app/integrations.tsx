import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text } from "react-native";
import { AiConnectForm } from "@/components/ai-connect-form";
import { BankSmsCard } from "@/components/bank-sms-card";
import { ChatgptConnectForm } from "@/components/chatgpt-connect-form";
import { Badge, Card, EmptyState, IconTile, ListRow, toneToBadge, type } from "@/components/drift";
import { Button, Loading, Screen, Segments } from "@/components/screen";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { useSeerr } from "@/hooks/use-seerr";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { aiState, integrationsApi, seerrState, whoopState, type IntegrationsOverview } from "@/lib/integrations";

// Every connection, set up here by you for your account only. No server settings to touch.
export default function Integrations() {
  const seerr = useSeerr();
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAiMethod, setSelectedAiMethod] = useState<"chatgpt" | "api" | null>(null);

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
        {loading ? <Loading /> : <EmptyState>{error ?? "Couldn't load your connections. Pull to try again."}</EmptyState>}
      </Screen>
    );
  }

  const whoop = whoopState(overview.whoop);
  const seerrNow = seerrState(seerr.status ?? overview.seerr);
  const ai = aiState(overview.ai, overview.chatgpt);
  const aiMethod = selectedAiMethod ?? (overview.chatgpt.status !== "not_connected" || !overview.ai.connected ? "chatgpt" : "api");

  const disconnectSeerr = () =>
    Alert.alert("Disconnect Seerr?", "Orbit forgets the address and key. Your watch list stays.", [
      { text: "Disconnect", style: "destructive", onPress: () => void seerr.disconnect().then(load) },
      { text: "Cancel", style: "cancel" }
    ]);

  const disconnectAi = () =>
    Alert.alert("Disconnect AI?", "Orbit forgets your API key. Summaries already written stay.", [
      { text: "Disconnect", style: "destructive", onPress: () => void integrationsApi.disconnectAi(getApi()).then(load) },
      { text: "Cancel", style: "cancel" }
    ]);

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={[type.shellMuted, { paddingHorizontal: 4 }]}>Each connection is yours only. Keys are kept encrypted on your Orbit server.</Text>

      <Card title="WHOOP" action={<Badge tone={toneToBadge(whoop.tone)}>{whoop.label}</Badge>}>
        <ListRow
          leading={<IconTile name="watch" />}
          title={overview.whoop.connected ? "Open WHOOP" : "Connect WHOOP"}
          subtitle={whoop.detail}
          href={overview.whoop.configured ? "/whoop" : undefined}
          chevron={overview.whoop.configured}
        />
      </Card>

      <Card title="Seerr" action={<Badge tone={toneToBadge(seerrNow.tone)}>{seerrNow.label}</Badge>}>
        {seerr.error ? <Text style={type.rowSubtitle}>{seerr.error}</Text> : null}
        {!seerr.ready ? (
          <Loading />
        ) : seerr.connected ? (
          <>
            <ListRow leading={<IconTile name="film" />} title="Open Movies & TV" subtitle={seerrNow.detail} href="/media" chevron />
            <Button variant="outline" title="Disconnect Seerr" onPress={disconnectSeerr} />
          </>
        ) : (
          <>
            <Text style={type.rowSubtitle}>{seerrNow.detail}</Text>
            <SeerrConnectForm connect={(url, key) => seerr.connect(url, key).then(load)} />
          </>
        )}
      </Card>

      <BankSmsCard />

      <Card title={t.aiSummary} action={<Badge tone={toneToBadge(ai.tone)}>{ai.label}</Badge>}>
        <ListRow leading={<IconTile name="feather" />} title="Written summaries" subtitle={ai.detail} />
        <Text style={type.rowTitle}>{t.aiConnectionMethod}</Text>
        <Segments
          options={["chatgpt", "api"] as const}
          labels={{ chatgpt: t.aiChatgptMethod, api: t.aiApiMethod }}
          value={aiMethod}
          onChange={setSelectedAiMethod}
        />
        {aiMethod === "chatgpt" ? (
          <ChatgptConnectForm
            status={overview.chatgpt}
            start={async () => {
              const result = await integrationsApi.startChatgpt(getApi());
              setOverview((current) => current ? { ...current, chatgpt: { status: result.status } } : current);
              return result.authorization_url;
            }}
            finish={async (callbackUrl) => {
              try {
                await integrationsApi.finishChatgpt(getApi(), callbackUrl);
              } finally {
                await load();
              }
            }}
            disconnect={async () => {
              await integrationsApi.disconnectChatgpt(getApi());
              await load();
            }}
          />
        ) : (
          <>
            {overview.chatgpt.status === "connected" ? <Text style={type.rowSubtitle}>{t.aiChatgptActiveHint}</Text> : null}
            <AiConnectForm
              status={overview.ai}
              connect={async (input) => {
                await integrationsApi.connectAi(getApi(), input);
                await load();
              }}
            />
            {overview.ai.connected ? <Button variant="outline" title="Disconnect AI" onPress={disconnectAi} /> : null}
          </>
        )}
      </Card>
    </Screen>
  );
}
