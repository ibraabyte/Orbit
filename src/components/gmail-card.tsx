import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text } from "react-native";
import { Badge, Card, IconTile, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { gmailResultMessage, hunterApi, st, type GmailStatus } from "@/lib/subscriptions";

// Read-only Gmail: link, see which address, unlink. Used on Integrations and on the subscription hunter.
// returnPath is the screen Google's page comes back to (it also closes the sign-in sheet).
export function GmailCard({ status, onChange, returnPath }: { status: GmailStatus | null; onChange: () => void | Promise<void>; returnPath: string }) {
  const { sheet } = useOverlays();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setNotice({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const returnTo = Linking.createURL(returnPath);
      const { url } = await hunterApi.gmailConnectUrl(getApi(), returnTo);
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      if (result.type === "success") setNotice(gmailResultMessage(result.url));
      await onChange();
    });

  const disconnect = () =>
    sheet({
      title: st.gmailUnlinkTitle,
      detail: st.gmailUnlinkDetail,
      options: [
        {
          label: st.gmailDisconnect,
          destructive: true,
          run: () =>
            void run(async () => {
              await hunterApi.gmailDisconnect(getApi());
              setNotice({ ok: true, message: st.gmailDisconnected });
              await onChange();
            })
        }
      ]
    });

  const connected = Boolean(status?.connected);
  const badge = !status ? null : connected ? (status.last_error ? <Badge tone="urgent" glyph="!">{st.gmailRelink}</Badge> : <Badge tone="success">{st.gmailLinked}</Badge>) : null;

  return (
    <Card title={st.gmail} action={badge}>
      {notice ? <Text style={notice.ok ? { color: colors.success } : ui.error}>{notice.message}</Text> : null}
      {connected && status ? (
        <>
          <ListRow first leading={<IconTile name="mail" />} title={st.gmailConnected(status.email ?? "")} subtitle={status.last_error ?? null} />
          {status.last_error ? <Button title={st.gmailConnect} disabled={busy} onPress={connect} /> : null}
          <Button variant="outline" title={st.gmailDisconnect} disabled={busy} onPress={disconnect} />
        </>
      ) : (
        <>
          <Text style={type.rowSubtitle}>{status && !status.configured ? st.gmailNotSetUp : st.gmailIntro}</Text>
          {status?.configured ? <Button title={busy ? st.gmailConnecting : st.gmailConnect} disabled={busy} onPress={connect} /> : null}
        </>
      )}
    </Card>
  );
}
