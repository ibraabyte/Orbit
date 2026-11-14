import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { Badge, Card, EmptyState, Icon, IconTile, ListRow, type } from "@/components/drift";
import { Button, Columns, Input, Screen, Segments } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { formatDate, t } from "@/lib/i18n";
import { callBadge, callsApi, phoneValid, px, setupReady, type PhoneCall, type PhoneSetup } from "@/lib/phone-calls";

const open = (call: PhoneCall) => router.push({ pathname: "/phone-call", params: { id: call.id } });
const failed = (error: unknown) => Alert.alert(px.calls, error instanceof Error ? error.message : t.tryAgain);

// Your Twilio account: SID, auth token (kept on the server only), the number calls come from, and the agent's voice.
function SetupCard({ setup, onSaved }: { setup: PhoneSetup | null; onSaved: (next: PhoneSetup | null) => void }) {
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState(setup?.from_number ?? "");
  const [voice, setVoice] = useState(setup?.voice ?? "marin");
  const [busy, setBusy] = useState(false);
  const voices = setup?.voices ?? ["marin", "cedar", "ash", "coral", "sage", "verse"];
  const form = { accountSid, authToken, fromNumber, voice };

  const remove = () =>
    Alert.alert(px.removeTitle, px.removeBody, [
      { text: t.cancel, style: "cancel" },
      { text: px.removeSetup, style: "destructive", onPress: () => void callsApi.removeSetup(getApi()).then(() => onSaved(null)).catch(failed) }
    ]);

  return (
    <Card title={px.setup} action={<Badge tone={setup?.connected ? "success" : "neutral"}>{setup?.connected ? px.connected : px.notConnected}</Badge>}>
      <Text style={type.rowSubtitle}>{px.setupIntro}</Text>
      {setup?.connected ? <ListRow leading={<IconTile name="phone" tone="accent" />} title={setup.from_number ?? ""} subtitle={`AC…${setup.account_hint ?? ""} · ${setup.voice}`} trailing={<Pressable onPress={remove} accessibilityRole="button" accessibilityLabel={px.removeSetup} hitSlop={6}><Icon name="trash-2" color={colors.inkMuted} /></Pressable>} /> : null}
      <Input accessibilityLabel={px.accountSid} placeholder={px.accountSid} value={accountSid} onChangeText={setAccountSid} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={px.authToken} placeholder={setup?.connected ? px.tokenSaved : px.authToken} value={authToken} onChangeText={setAuthToken} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={px.fromNumber} placeholder={px.fromNumber} value={fromNumber} onChangeText={setFromNumber} keyboardType="phone-pad" style={{ writingDirection: "ltr" }} />
      <Text style={type.rowSubtitle}>{px.fromHint}</Text>
      <Text style={type.rowSubtitle}>{px.voice}</Text>
      <Segments small options={voices} value={voice} onChange={setVoice} />
      <Button
        title={busy ? px.savingSetup : px.saveSetup}
        disabled={busy || !setupReady(form, setup)}
        onPress={async () => {
          setBusy(true);
          try {
            const next = await callsApi.saveSetup(getApi(), form);
            setAuthToken("");
            onSaved(next);
            Alert.alert(px.setup, t.saved);
          } catch (error) {
            failed(error);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

// Calls for me: tell the agent what to book and who to call, check its plan, and see how past calls went.
export default function PhoneCalls() {
  const [setup, setSetup] = useState<PhoneSetup | null>(null);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState("");
  const [business, setBusiness] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSetup, nextCalls] = await Promise.all([callsApi.setup(getApi()), callsApi.list(getApi())]);
      setSetup(nextSetup);
      setCalls(nextCalls);
    } catch (error) {
      failed(error);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const prepare = async () => {
    if (!phoneValid(number)) return Alert.alert(px.number, px.numberBad);
    setBusy(true);
    try {
      const call = await callsApi.plan(getApi(), request, business, number);
      setRequest("");
      setBusiness("");
      setNumber("");
      open(call);
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  const left = (
    <>
      <Card title={px.newCall}>
        {setup && !setup.connected ? <Text style={type.rowSubtitle}>{px.setupNotReady}</Text> : null}
        {setup && !setup.openai ? (
          <ListRow leading={<IconTile name="key" tone="urgent" />} title={px.openIntegrations} subtitle={px.needOpenai} href="/integrations" chevron />
        ) : null}
        <Text style={type.rowSubtitle}>{px.request}</Text>
        <Input accessibilityLabel={px.request} placeholder={px.requestPh} value={request} onChangeText={setRequest} multiline maxLength={500} />
        <Input accessibilityLabel={px.business} placeholder={`${px.business}: ${px.businessPh}`} value={business} onChangeText={setBusiness} maxLength={120} />
        <Text style={type.rowSubtitle}>{px.number}</Text>
        <Input accessibilityLabel={px.number} placeholder={px.numberPh} value={number} onChangeText={setNumber} keyboardType="phone-pad" style={{ writingDirection: "ltr" }} />
        <Button variant="primary" title={busy ? px.preparing : px.prepare} disabled={busy || !request.trim() || !number.trim()} onPress={() => void prepare()} />
      </Card>
      <Card title={px.past}>
        {calls.length ? (
          calls.map((call, index) => {
            const badge = callBadge(call);
            return (
              <ListRow
                key={call.id}
                first={index === 0}
                leading={<IconTile name="phone-outgoing" tone={badge.tone === "success" ? "accent" : "neutral"} />}
                title={call.business_name}
                badges={<Badge tone={badge.tone}>{badge.label}</Badge>}
                subtitle={call.summary ?? call.goal}
                meta={formatDate(call.created_at)}
                onPress={() => open(call)}
                chevron
              />
            );
          })
        ) : (
          <EmptyState icon="phone" example={px.emptyExample}>{px.empty}</EmptyState>
        )}
      </Card>
    </>
  );

  return (
    <Screen wide refreshing={loading} onRefresh={() => void load()}>
      <Columns left={left} right={setup ? <SetupCard key={`${setup.from_number}-${setup.voice}`} setup={setup} onSaved={(next) => (next ? setSetup(next) : void load())} /> : null} />
    </Screen>
  );
}
