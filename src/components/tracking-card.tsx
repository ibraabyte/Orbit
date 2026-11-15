import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text } from "react-native";
import { Badge, Card, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { shipmentsApi, sx, TRACKING_SIGNUP_URL, type TrackingStatus } from "@/lib/shipments";

// The user's own 17TRACK key: paste it once, see that it is linked, unlink. Used on Shipments and on Integrations.
export function TrackingCard({ status, onChange }: { status: TrackingStatus | null; onChange: () => void | Promise<void> }) {
  const { sheet } = useOverlays();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const connect = async () => {
    setBusy(true);
    try {
      const linked = await shipmentsApi.connect(getApi(), key);
      setKey("");
      setNotice({ ok: true, message: linked.credits_left === null ? sx.trackingConnected : `${sx.trackingConnected}\n${sx.trackingCredits(linked.credits_left)}` });
      await onChange();
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    sheet({
      title: sx.trackingUnlinkTitle,
      detail: sx.trackingUnlinkDetail,
      options: [
        {
          label: sx.trackingDisconnect,
          destructive: true,
          run: () =>
            void (async () => {
              setBusy(true);
              try {
                await shipmentsApi.disconnect(getApi());
                setNotice({ ok: true, message: sx.trackingUnlinked });
                await onChange();
              } catch (error) {
                setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
              } finally {
                setBusy(false);
              }
            })()
        }
      ]
    });

  const connected = Boolean(status?.connected);
  const badge = !status || !connected ? null : status.last_error ? <Badge tone="urgent" glyph="!">{sx.trackingFix}</Badge> : <Badge tone="success">{sx.trackingLinked}</Badge>;
  const form = (
    <>
      <Input accessibilityLabel={sx.trackingKeyPh} placeholder={sx.trackingKeyPh} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Button title={busy ? sx.trackingConnecting : sx.trackingConnect} disabled={busy || key.trim().length < 8} onPress={() => void connect()} />
    </>
  );

  return (
    <Card title={sx.tracking} action={badge}>
      {notice ? <Text style={notice.ok ? { color: colors.success } : ui.error}>{notice.message}</Text> : null}
      {connected && status ? (
        <>
          <ListRow first leading={<IconTile name="package" />} title="17TRACK" subtitle={status.last_error ?? sx.trackingConnected} />
          {status.last_error ? form : null}
          <Button variant="outline" title={sx.trackingDisconnect} disabled={busy} onPress={disconnect} />
        </>
      ) : (
        <>
          <Text style={type.rowSubtitle}>{sx.trackingIntro}</Text>
          {form}
          <Button variant="outline" title={sx.trackingOpenSite} onPress={() => void WebBrowser.openBrowserAsync(TRACKING_SIGNUP_URL)} />
        </>
      )}
    </Card>
  );
}
