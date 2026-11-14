import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { AiConnectForm } from "@/components/ai-connect-form";
import { BankSmsCard } from "@/components/bank-sms-card";
import { FeatureModelsCard } from "@/components/feature-models-card";
import { ChatgptConnectForm } from "@/components/chatgpt-connect-form";
import { Badge, Card, EmptyState, Icon, IconTile, ListRow, toneToBadge, type } from "@/components/drift";
import { Button, Loading, Screen, Segments } from "@/components/screen";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { VoiceConnectForm } from "@/components/voice-connect-form";
import { colors } from "@/components/theme";
import { useSeerr } from "@/hooks/use-seerr";
import { getApi } from "@/lib/backend";
import { featuresOf, removeBody, usedBy } from "@/lib/feature-models";
import { t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, aiChoicesOf, aiState, integrationsApi, seerrState, VOICE_PROVIDER_NAMES, voiceOff, voiceState, whoopState, type AiChoice, type IntegrationsOverview } from "@/lib/integrations";

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

  const voice = overview.voice ?? voiceOff;
  const voiceNow = voiceState(overview.voice);
  const removeVoice = () =>
    Alert.alert(t.voiceRemove, removeBody(t.voiceRemoveBody, usedBy(featuresOf(overview), "cloud", "speech")), [
      {
        text: t.aiRemove,
        style: "destructive",
        onPress: () => void integrationsApi.disconnectVoice(getApi()).then(load).catch((actionError: unknown) => Alert.alert(t.voiceModel, actionError instanceof Error ? actionError.message : t.tryAgain))
      },
      { text: t.cancel, style: "cancel" }
    ]);

  const ais = aiChoicesOf(overview);
  const failed = (action: Promise<unknown>) =>
    action.then(load).catch((actionError: unknown) => Alert.alert(t.aiSummary, actionError instanceof Error ? actionError.message : t.tryAgain));
  const removeAi = (choice: AiChoice) =>
    // Features set to this AI go back to the default, so name them first.
    Alert.alert(t.aiRemoveTitle, removeBody(t.aiRemoveBody, usedBy(featuresOf(overview), choice.provider)), [
      {
        text: t.aiRemove,
        style: "destructive",
        onPress: () =>
          void failed(choice.provider === "chatgpt" ? integrationsApi.disconnectChatgpt(getApi()) : integrationsApi.disconnectOneAi(getApi(), choice.provider))
      },
      { text: t.cancel, style: "cancel" }
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
        {ais.choices.length ? (
          <>
            <Text style={type.rowTitle}>{t.aiConnectedList}</Text>
            {ais.choices.map((choice) => (
              <ListRow
                key={choice.provider}
                leading={<IconTile name={choice.provider === "chatgpt" ? "message-circle" : "cpu"} />}
                title={AI_CHOICE_NAMES[choice.provider]}
                subtitle={choice.model ?? undefined}
                trailing={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {choice.is_default ? (
                      <Badge tone="success">{t.aiDefault}</Badge>
                    ) : (
                      <Pressable onPress={() => void failed(integrationsApi.setAiDefault(getApi(), choice.provider))} accessibilityRole="button" hitSlop={6}>
                        <Text style={[type.pill, { color: colors.accentDeep }]}>{t.aiMakeDefault}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => removeAi(choice)} accessibilityRole="button" accessibilityLabel={`${t.aiRemove} ${AI_CHOICE_NAMES[choice.provider]}`} hitSlop={6}>
                      <Icon name="x" size={16} color={colors.inkMuted} />
                    </Pressable>
                  </View>
                }
              />
            ))}
            <Text style={type.rowTitle}>{t.aiAddAnother}</Text>
          </>
        ) : null}
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
              saved={ais.choices}
              connect={async (input) => {
                await integrationsApi.connectAi(getApi(), input);
                await load();
              }}
            />
          </>
        )}
      </Card>

      {overview.voice ? (
        <Card title={t.voiceModel} action={<Badge tone={toneToBadge(voiceNow.tone)}>{voiceNow.label}</Badge>}>
          <Text style={type.rowSubtitle}>{t.voiceIntro}</Text>
          {voice.connected && voice.provider ? (
            <ListRow
              leading={<IconTile name="mic" />}
              title={VOICE_PROVIDER_NAMES[voice.provider]}
              subtitle={voice.model ?? undefined}
              trailing={
                <Pressable onPress={removeVoice} accessibilityRole="button" accessibilityLabel={t.voiceRemove} hitSlop={6}>
                  <Icon name="x" size={16} color={colors.inkMuted} />
                </Pressable>
              }
            />
          ) : (
            <ListRow leading={<IconTile name="smartphone" />} title={voiceNow.label} subtitle={voiceNow.detail} />
          )}
          <VoiceConnectForm
            key={`${voice.provider}-${voice.model}`}
            status={voice}
            connect={async (input) => {
              await integrationsApi.connectVoice(getApi(), input);
              await load();
            }}
          />
        </Card>
      ) : null}

      <FeatureModelsCard overview={overview} onSaved={(features) => setOverview((current) => (current ? { ...current, features } : current))} />
    </Screen>
  );
}
