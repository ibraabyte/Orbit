import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Share, Text } from "react-native";
import { ConnectionTile, IconMark, TileGrid } from "@/components/ai-provider-parts";
import { Card, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { bankSmsApi, type BankSmsStatus } from "@/lib/bank-sms";
import { formatDate, t } from "@/lib/i18n";

// The key for the iPhone Shortcut. The server keeps only its hash, so this is the one moment it can be read.
// ponytail: copying goes through the share sheet (it has Copy) instead of adding expo-clipboard.
export function BankSmsCard() {
  const [status, setStatus] = useState<BankSmsStatus | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { sheet } = useOverlays();
  const address = `${process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "")}/bank-sms`;

  const load = useCallback(async () => {
    try {
      setStatus(await bankSmsApi.status(getApi()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const run = async (write: () => Promise<unknown>) => {
    try {
      await write();
      await load();
    } catch (error) {
      Alert.alert(t.error, error instanceof Error ? error.message : "");
    }
  };

  const create = () => run(async () => setNewKey((await bankSmsApi.newToken(getApi())).token));
  const confirmReplace = () =>
    Alert.alert(t.bankSmsReplaceTitle, t.bankSmsReplaceBody, [
      { text: t.bankSmsNewKey, style: "destructive", onPress: () => void create() },
      { text: t.cancel, style: "cancel" }
    ]);
  const confirmOff = () =>
    Alert.alert(t.bankSmsOffTitle, t.bankSmsOffBody, [
      {
        text: t.bankSmsOff,
        style: "destructive",
        onPress: () =>
          void run(async () => {
            setNewKey(null);
            await bankSmsApi.revokeToken(getApi());
          })
      },
      { text: t.cancel, style: "cancel" }
    ]);

  const connected = status?.connected ?? false;
  // Not set up: a tap makes the key. Set up: make a new key or turn it off.
  const press = () => {
    if (!status) return;
    if (!connected) return void create();
    sheet({
      title: t.bankSms,
      detail: status.last_used_at ? `${t.bankSmsLastUsed} ${formatDate(status.last_used_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : t.bankSmsUnused,
      options: [
        { label: t.bankSmsNewKey, run: confirmReplace },
        { label: t.bankSmsOff, destructive: true, run: confirmOff }
      ]
    });
  };

  // A tile like every other service, in a Money card that can take more later. The new key shows once, under it.
  return (
    <Card title={t.pv.svcMoney}>
      <TileGrid>
        <ConnectionTile
          wide
          mark={<IconMark name="message-circle" />}
          name={t.bankSms}
          badge={connected ? "check" : null}
          icons={["credit-card"]}
          label={`${t.bankSms}, ${connected ? t.bankSmsOn : t.bankSmsNotSet}`}
          onPress={status ? press : undefined}
        />
      </TileGrid>
      {failed && !status ? <Text style={type.rowSubtitle}>{t.error}</Text> : null}
      {newKey ? (
        <>
          <Text style={type.rowSubtitle}>{t.bankSmsOnce}</Text>
          <Text style={type.rowTitle}>{t.bankSmsAddress}</Text>
          <Text style={type.rowSubtitle} selectable>{address}</Text>
          <Text style={type.rowTitle}>{t.bankSmsKey}</Text>
          <Text style={type.rowSubtitle} selectable>{newKey}</Text>
          <Button title={t.bankSmsShare} onPress={() => void Share.share({ message: newKey })} />
          <Button variant="outline" title={t.done} onPress={() => setNewKey(null)} />
        </>
      ) : null}
    </Card>
  );
}
