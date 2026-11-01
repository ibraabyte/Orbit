import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Share, Text } from "react-native";
import { Badge, Card, type } from "@/components/drift";
import { Button, Loading } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { bankSmsApi, type BankSmsStatus } from "@/lib/bank-sms";
import { formatDate, t } from "@/lib/i18n";

// The key for the iPhone Shortcut. The server keeps only its hash, so this is the one moment it can be read.
// ponytail: copying goes through the share sheet (it has Copy) instead of adding expo-clipboard.
export function BankSmsCard() {
  const [status, setStatus] = useState<BankSmsStatus | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
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
  return (
    <Card title={t.bankSms} action={status ? <Badge tone={connected ? "accent" : "neutral"}>{connected ? t.bankSmsOn : t.bankSmsNotSet}</Badge> : undefined}>
      {!status ? (
        failed ? <Text style={type.rowSubtitle}>{t.error}</Text> : <Loading />
      ) : newKey ? (
        <>
          <Text style={type.rowSubtitle}>{t.bankSmsOnce}</Text>
          <Text style={type.rowTitle}>{t.bankSmsAddress}</Text>
          <Text style={type.rowSubtitle} selectable>{address}</Text>
          <Text style={type.rowTitle}>{t.bankSmsKey}</Text>
          <Text style={type.rowSubtitle} selectable>{newKey}</Text>
          <Button title={t.bankSmsShare} onPress={() => void Share.share({ message: newKey })} />
          <Button variant="outline" title={t.done} onPress={() => setNewKey(null)} />
        </>
      ) : connected ? (
        <>
          <Text style={type.rowSubtitle}>
            {status.last_used_at ? `${t.bankSmsLastUsed} ${formatDate(status.last_used_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : t.bankSmsUnused}
          </Text>
          <Button variant="outline" title={t.bankSmsNewKey} onPress={confirmReplace} />
          <Button variant="outline" title={t.bankSmsOff} onPress={confirmOff} />
        </>
      ) : (
        <>
          <Text style={type.rowSubtitle}>{t.bankSmsHint}</Text>
          <Button title={t.bankSmsCreate} onPress={() => void create()} />
        </>
      )}
    </Card>
  );
}
