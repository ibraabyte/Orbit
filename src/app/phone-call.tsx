import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Badge, Card, IconTile, ListRow, type } from "@/components/drift";
import { Button, Input, Loading, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { digits, t } from "@/lib/i18n";
import { appointmentText, callBadge, callsApi, isActive, px, type PhoneCall, type PlanChanges } from "@/lib/phone-calls";

const POLL_MS = 2000;
const failed = (error: unknown) => Alert.alert(px.calls, error instanceof Error ? error.message : t.tryAgain);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.rowSubtitle}>{label}</Text>
      {children}
    </View>
  );
}

// The plan, editable while it waits for you. Only "Approve and call" starts the call.
function PlanCard({ call, onChange }: { call: PhoneCall; onChange: (next: PhoneCall) => void }) {
  const [plan, setPlan] = useState<Required<PlanChanges>>({
    business_name: call.business_name,
    to_number: call.to_number,
    goal: call.goal,
    opening: call.opening,
    allowed: call.allowed ?? "",
    caller_name: call.caller_name ?? ""
  });
  const [busy, setBusy] = useState(false);
  const set = (changes: PlanChanges) => setPlan((current) => ({ ...current, ...changes }));
  const changed = (Object.keys(plan) as (keyof PlanChanges)[]).filter((key) => (plan[key] ?? "") !== (call[key] ?? ""));

  const approve = async () => {
    setBusy(true);
    try {
      if (changed.length) await callsApi.change(getApi(), call.id, Object.fromEntries(changed.map((key) => [key, plan[key]])));
      onChange(await callsApi.start(getApi(), call.id));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={px.planTitle}>
      <Text style={type.rowSubtitle}>{px.planIntro}</Text>
      <Field label={px.calling}>
        <Input accessibilityLabel={px.business} value={plan.business_name ?? ""} onChangeText={(value) => set({ business_name: value })} maxLength={120} />
        <Input accessibilityLabel={px.number} value={plan.to_number ?? ""} onChangeText={(value) => set({ to_number: value })} keyboardType="phone-pad" style={{ writingDirection: "ltr" }} />
      </Field>
      <Field label={px.firstWords}>
        <Text style={[type.rowTitle, { color: colors.inkMuted }]}>{call.disclosure}</Text>
      </Field>
      <Field label={px.opening}>
        <Input accessibilityLabel={px.opening} value={plan.opening ?? ""} onChangeText={(value) => set({ opening: value })} multiline maxLength={300} />
      </Field>
      <Field label={px.goal}>
        <Input accessibilityLabel={px.goal} value={plan.goal ?? ""} onChangeText={(value) => set({ goal: value })} multiline maxLength={500} />
      </Field>
      <Field label={px.allowed}>
        <Input accessibilityLabel={px.allowed} placeholder={px.allowedPh} value={plan.allowed ?? ""} onChangeText={(value) => set({ allowed: value })} multiline maxLength={300} />
      </Field>
      <Field label={px.name}>
        <Input accessibilityLabel={px.name} placeholder={px.namePh} value={plan.caller_name ?? ""} onChangeText={(value) => set({ caller_name: value })} maxLength={60} />
      </Field>
      <ListRow leading={<IconTile name="shield" tone="accent" />} title={px.rules} />
      <Text style={type.rowSubtitle}>{px.cost}</Text>
      <Button variant="primary" title={busy ? px.starting : px.approve} disabled={busy || !plan.goal?.trim() || !plan.opening?.trim()} onPress={() => void approve()} />
    </Card>
  );
}

export default function PhoneCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useDashboardData();
  const [call, setCall] = useState<PhoneCall | null>(null);

  const load = useCallback(async () => {
    try {
      setCall(await callsApi.get(getApi(), id));
    } catch (error) {
      failed(error);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // While it's on the line, follow it; once it ends, refresh the tasks so a booking shows up.
  const active = call ? isActive(call) : false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearInterval(timer);
      void refresh();
    };
  }, [active, load, refresh]);

  if (!call) return <Screen><Loading /></Screen>;
  const badge = callBadge(call);

  const hangUp = () => void callsApi.hangUp(getApi(), call.id).then(setCall).catch(failed);
  const remove = () =>
    Alert.alert(px.deleteTitle, px.deleteBody, [
      { text: t.cancel, style: "cancel" },
      { text: px.deleteCall, style: "destructive", onPress: () => void callsApi.remove(getApi(), call.id).then(() => router.back()).catch(failed) }
    ]);

  return (
    <Screen>
      <ListRow first leading={<IconTile name="phone-outgoing" tone="accent" />} title={call.business_name} subtitle={call.to_number} badges={<Badge tone={badge.tone}>{badge.label}</Badge>} meta={call.duration_seconds ? digits(px.duration(call.duration_seconds)) : undefined} />
      <Text style={type.rowSubtitle}>{call.request}</Text>
      {call.status === "draft" ? <PlanCard call={call} onChange={setCall} /> : null}
      {active ? (
        <Card title={badge.label}>
          <Text style={type.rowSubtitle}>{px.live}</Text>
          <Button title={px.hangUp} onPress={hangUp} />
        </Card>
      ) : null}
      {call.status !== "draft" && !active ? (
        <Card title={px.result} action={<Badge tone={badge.tone}>{badge.label}</Badge>}>
          {call.appointment_at ? <ListRow first leading={<IconTile name="calendar" tone="accent" />} title={appointmentText(call.appointment_at)} subtitle={px.appointment} /> : null}
          {call.summary ? <Text style={type.rowTitle}>{call.summary}</Text> : null}
          {call.error ? <Text style={[type.rowSubtitle, { color: colors.urgent }]}>{call.error}</Text> : null}
          {call.task_id ? <ListRow leading={<IconTile name="check-square" />} title={px.addedToTask} href={{ pathname: "/task/[id]", params: { id: call.task_id } }} chevron /> : null}
        </Card>
      ) : null}
      {call.status !== "draft" ? (
        <Card title={px.transcript}>
          {call.transcript.length ? (
            call.transcript.map((line, index) => <ListRow key={index} first={index === 0} title={line.text} subtitle={line.who === "agent" ? px.agent : px.them} />)
          ) : (
            <Text style={type.rowSubtitle}>{px.noTranscript}</Text>
          )}
        </Card>
      ) : null}
      {!active ? <Button variant="outline" title={px.deleteCall} onPress={remove} /> : null}
    </Screen>
  );
}
