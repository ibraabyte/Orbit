import { useState } from "react";
import { Alert } from "react-native";
import { ConnectionTile, IconMark } from "@/components/ai-provider-parts";
import { useOverlays } from "@/components/overlays";
import { appleHealthApi, type AppleHealthStatus } from "@/lib/apple-health";
import { appleHealthAvailable, syncAppleHealth } from "@/lib/apple-health-native";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";

// Apple Health, a tile next to WHOOP in the Health card. Only an iPhone build can read Health, so elsewhere the card shows only once
// this account already has days (to let you disconnect them).
export function AppleHealthTile({ status, onChange }: { status: AppleHealthStatus | undefined; onChange: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const { sheet } = useOverlays();
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

  // Not linked: a tap links it (the Health permission sheet). Linked: sync now or disconnect.
  const press = () => {
    if (busy) return;
    if (!status.connected) return void sync();
    sheet({
      title: "Apple Health",
      options: [
        ...(appleHealthAvailable ? [{ label: t.pv.ahSync, run: () => void sync() }] : []),
        { label: t.pv.ahDisconnect, destructive: true, run: disconnect }
      ]
    });
  };

  return (
    <ConnectionTile
      wide
      mark={<IconMark name="heart" color="#FF2D55" />}
      name="Apple Health"
      badge={status.connected ? "check" : null}
      icons={["activity", "moon", "heart"]}
      label={`Apple Health, ${busy ? t.pv.ahSyncing : status.connected ? t.pv.connected : t.pv.notConnected}`}
      onPress={press}
    />
  );
}
