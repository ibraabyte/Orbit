import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Text } from "react-native";
import { ConnectionTile, LogoMark, TileGrid } from "@/components/ai-provider-parts";
import { Badge, Card, ListRow } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { gmailResultMessage, hunterApi, st, type GmailStatus } from "@/lib/subscriptions";

// Read-only Gmail: link, see which address, unlink. Used on Integrations and on the subscription hunter.
// returnPath is the screen Google's page comes back to (it also closes the sign-in sheet).
export function GmailCard({ status, onChange, returnPath, tile }: { status: GmailStatus | null; onChange: () => void | Promise<void>; returnPath: string; tile?: boolean }) {
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

  // On Connections: a tile like every other service, in an Email card that can hold more mail services later.
  // Not linked: a tap links it. Linked: link again (when Google needs it) or unlink.
  if (tile) {
    const press = () => {
      if (busy || !status?.configured) return;
      if (!connected || status.last_error) return void connect();
      sheet({ title: status.email ?? "Gmail", options: [{ label: st.gmailDisconnect, destructive: true, run: () => disconnect() }] });
    };
    return (
      <Card title={st.email}>
        {notice && !notice.ok ? <Text style={ui.error}>{notice.message}</Text> : null}
        <TileGrid>
          <ConnectionTile
            wide
            mark={<LogoMark source={require("../../assets/brand/ai/gmail.png")} />}
            name="Gmail"
            badge={!connected ? null : status?.last_error ? "alert" : "check"}
            icons={["mail", "credit-card"]}
            label={`Gmail, ${connected ? (status?.email ?? st.gmailLinked) : st.gmailConnect}`}
            onPress={status?.configured ? press : undefined}
          />
        </TileGrid>
      </Card>
    );
  }
  const badge = !status ? null : connected ? (status.last_error ? <Badge tone="urgent" glyph="!">{st.gmailRelink}</Badge> : <Badge tone="success">{st.gmailLinked}</Badge>) : null;

  return (
    <Card title={st.gmail} action={badge}>
      {notice ? <Text style={notice.ok ? { color: colors.success } : ui.error}>{notice.message}</Text> : null}
      {connected && status ? (
        <>
          <ListRow first leading={<LogoMark source={require("../../assets/brand/ai/gmail.png")} />} title={st.gmailConnected(status.email ?? "")} subtitle={status.last_error ?? null} />
          {status.last_error ? <Button title={st.gmailConnect} disabled={busy} onPress={connect} /> : null}
          <Button variant="outline" title={st.gmailDisconnect} disabled={busy} onPress={disconnect} />
        </>
      ) : (
        <>
          <ListRow first leading={<LogoMark source={require("../../assets/brand/ai/gmail.png")} />} title="Gmail" subtitle={status && !status.configured ? st.gmailNotSetUp : st.gmailIntro} />
          {status?.configured ? <Button title={busy ? st.gmailConnecting : st.gmailConnect} disabled={busy} onPress={connect} /> : null}
        </>
      )}
    </Card>
  );
}
