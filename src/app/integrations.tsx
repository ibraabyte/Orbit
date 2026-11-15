import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text } from "react-native";
import { AppleHealthCard } from "@/components/apple-health-card";
import { ConnectionTile, IconMark, LogoMark, PickRow, ProviderGrid, ProviderMark, TileGrid, type Pick } from "@/components/ai-provider-parts";
import { BankSmsCard } from "@/components/bank-sms-card";
import { Card, EmptyState, Icon, ListRow, type } from "@/components/drift";
import { colors } from "@/components/theme";
import { PROVIDERS } from "@/lib/ai-providers";
import { Loading, Screen } from "@/components/screen";
import { SeerrConnectForm } from "@/components/seerr-connect-form";
import { useSeerr } from "@/hooks/use-seerr";
import { featuresApi, featuresOf } from "@/lib/feature-models";
import { digits, t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, aiChoicesOf, integrationsApi, seerrState, VOICE_PROVIDER_NAMES, whoopState, type AiChoiceName, type IntegrationsOverview } from "@/lib/integrations";
import { getApi } from "@/lib/backend";
import { callsApi, px, type PhoneSetup } from "@/lib/phone-calls";

// How many features picked their own model under Advanced, or nothing when all use the defaults.
function featureCount(overview: IntegrationsOverview): string | null {
  const rows = featuresOf(overview);
  const picked = rows.filter((row) => row.choice !== null && !row.stale).length;
  return picked ? digits(`${picked}/${rows.length}`) : null;
}

// Every connection, set up here by you for your account only. No server settings to touch.
export default function Integrations() {
  const seerr = useSeerr();
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState<PhoneSetup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await integrationsApi.overview(getApi()));
      setError(null);
      // The Twilio setup for calls made for you; an older server without it just leaves the tile unconnected.
      setPhone(await callsApi.setup(getApi()).catch(() => null));
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
        {loading ? <Loading /> : <EmptyState>{error ?? t.pv.loadFailed}</EmptyState>}
      </Screen>
    );
  }

  const ais = aiChoicesOf(overview);
  const textPicks: Pick[] = ais.choices.map(({ provider }) => ({ key: provider, label: AI_CHOICE_NAMES[provider], mark: <ProviderMark provider={PROVIDERS[provider === "chatgpt" ? "openai" : provider]} size={24} /> }));
  const speech = featuresOf(overview).find((row) => row.feature === "speech") ?? null;
  const voiceProvider = overview.voice?.connected ? overview.voice.provider : null;
  const voicePicks: Pick[] = (speech ? [...new Set([...(speech.default ? [speech.default] : []), ...speech.options])] : []).map((key) =>
    key === "cloud" && voiceProvider
      ? { key, label: VOICE_PROVIDER_NAMES[voiceProvider], mark: <ProviderMark provider={PROVIDERS[voiceProvider]} size={24} /> }
      : { key, label: t.featurePhone, mark: <IconMark name="smartphone" size={24} /> }
  );
  const save = async (change: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await change();
      await load();
    } catch (saveError) {
      Alert.alert(t.changeFailed, saveError instanceof Error ? saveError.message : t.tryAgain);
    } finally {
      setSaving(false);
    }
  };

  const whoop = whoopState(overview.whoop);
  const seerrNow = seerrState(seerr.status ?? overview.seerr);

  return (
    <Screen refreshing={loading} onRefresh={load}>
      {/* The companies, then the two choices most people need: the AI that writes and the voice model. Each
          feature can still pick its own under Advanced. */}
      <Card title={t.pv.aiSection}>
        <ProviderGrid overview={overview} />
        <PickRow icon="edit-3" title={t.pv.basicText} picks={textPicks} value={ais.default} disabled={saving} onPick={(key) => save(() => integrationsApi.setAiDefault(getApi(), key as AiChoiceName))} />
        {speech ? <PickRow icon="mic" title={t.pv.basicVoice} picks={voicePicks} value={speech.effective} disabled={saving} onPick={(key) => save(() => featuresApi.set(getApi(), "speech", key))} /> : null}
        <ListRow leading={<Icon name="sliders" size={18} color={colors.inkMuted} />} title={t.pv.advanced} subtitle={featureCount(overview)} href="/ai-features" chevron />
      </Card>

      {/* Every other connection is a tile like the AI companies, in a card named for its part of Orbit. */}
      <Card title={t.pv.svcHealth}>
        <TileGrid>
          <ConnectionTile
            wide
            mark={<IconMark name="watch" />}
            name="WHOOP"
            badge={whoop.tone === "warning" ? "alert" : overview.whoop.connected ? "check" : null}
            icons={["heart", "moon", "activity"]}
            label={`WHOOP, ${whoop.label}, ${whoop.detail}`}
            onPress={overview.whoop.configured ? () => router.push("/whoop") : undefined}
          />
        </TileGrid>
      </Card>

      <AppleHealthCard status={overview.apple_health} onChange={load} />

      <Card title={t.pv.svcMedia}>
        <TileGrid>
          <ConnectionTile
            wide
            mark={<IconMark name="film" />}
            name="Seerr"
            badge={seerr.connected ? "check" : null}
            icons={["film", "tv"]}
            label={`Seerr, ${seerrNow.label}, ${seerrNow.detail}`}
            onPress={seerr.connected ? () => router.push("/media") : undefined}
          />
        </TileGrid>
        {seerr.error ? <Text style={type.rowSubtitle}>{seerr.error}</Text> : null}
        {!seerr.ready ? <Loading /> : seerr.connected ? null : <SeerrConnectForm connect={(url, key) => seerr.connect(url, key).then(load)} />}
      </Card>

      <Card title={px.calls}>
        <TileGrid>
          <ConnectionTile
            wide
            mark={<LogoMark source={require("../../assets/brand/ai/twilio.png")} />}
            name="Twilio"
            badge={phone?.connected ? "check" : null}
            icons={["phone-outgoing"]}
            label={`Twilio, ${phone?.connected ? px.connected : px.notConnected}`}
            onPress={() => router.push("/phone-calls")}
          />
        </TileGrid>
      </Card>

      <BankSmsCard />
    </Screen>
  );
}
