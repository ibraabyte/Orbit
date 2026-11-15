import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, type } from "@/components/drift";
import { Button, Input, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { formatDate, t } from "@/lib/i18n";
import { callBadge, callsApi, phoneValid, px, type PhoneCall, type PhoneSetup } from "@/lib/phone-calls";

const open = (call: PhoneCall) => router.push({ pathname: "/phone-call", params: { id: call.id } });
const failed = (error: unknown) => Alert.alert(px.calls, error instanceof Error ? error.message : t.tryAgain);

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
        {setup && !setup.connected ? <ListRow leading={<IconTile name="phone" tone="urgent" />} title={px.setup} subtitle={px.notConnected} href="/twilio" chevron /> : null}
        {setup && !setup.provider ? (
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
      {left}
    </Screen>
  );
}
