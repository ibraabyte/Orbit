import { useState } from "react";
import { Alert } from "react-native";
import { Badge, Card, IconTile, ListRow } from "@/components/drift";
import { Button } from "@/components/screen";
import { appleHealthApi, type AppleHealthStatus } from "@/lib/apple-health";
import { appleHealthAvailable, syncAppleHealth } from "@/lib/apple-health-native";
import { getApi } from "@/lib/backend";
import { formatDate, t } from "@/lib/i18n";

// Apple Health sits next to WHOOP. Only an iPhone build can read Health, so elsewhere the card shows only once
// this account already has days (to let you disconnect them).
export function AppleHealthCard({ status, onChange }: { status: AppleHealthStatus | undefined; onChange: () => unknown }) {
  const [busy, setBusy] = useState(false);
  if (!status || (!appleHealthAvailable && !status.connected)) return null;

  const sync = async () => {
    setBusy(true);
    try {
      const saved = await syncAppleHealth(getApi(), { force: true });
      if (!saved) Alert.alert(t.pv.ahEmpty);
      await onChange();
    } catch {
      Alert.alert(t.pv.ahFailed);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    Alert.alert(t.pv.ahDisconnect, t.pv.ahDisconnectBody, [
      { text: t.pv.disconnectAction, style: "destructive", onPress: () => void appleHealthApi.disconnect(getApi()).then(onChange) },
      { text: t.cancel, style: "cancel" }
    ]);

  const synced = status.last_synced_at ? formatDate(status.last_synced_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : t.pv.ahReads;

  return (
    <Card title="Apple Health" action={<Badge tone={status.connected ? "success" : "neutral"}>{status.connected ? t.pv.connected : t.pv.notConnected}</Badge>}>
      {appleHealthAvailable ? (
        <ListRow
          leading={<IconTile name="heart" />}
          title={busy ? t.pv.ahSyncing : status.connected ? t.pv.ahSync : t.pv.ahConnect}
          subtitle={synced}
          onPress={busy ? undefined : () => void sync()}
          chevron
        />
      ) : null}
      {status.connected ? <Button variant="outline" title={t.pv.ahDisconnect} onPress={disconnect} /> : null}
    </Card>
  );
}
