import { useState } from "react";
import { Alert, Linking, Text } from "react-native";
import { Badge, ListRow, toneToBadge, type } from "@/components/drift";
import { Button, Input } from "@/components/screen";
import { t } from "@/lib/i18n";
import { chatgptState, type ChatgptStatus } from "@/lib/integrations";

export function ChatgptConnectForm({ status, start, finish, disconnect }: {
  status: ChatgptStatus;
  start: () => Promise<string>;
  finish: (callbackUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
}) {
  const [callbackUrl, setCallbackUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const state = chatgptState(status);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      Alert.alert("ChatGPT", error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListRow title="ChatGPT" subtitle={state.detail} trailing={<Badge tone={toneToBadge(state.tone)}>{state.label}</Badge>} />
      {status.status !== "connected" ? <Text style={type.rowSubtitle}>{t.chatgptLocalhostHint}</Text> : null}
      <Text style={type.rowSubtitle}>{t.chatgptPrivacy}</Text>
      <Button
        title={busy ? t.connecting : status.status === "not_connected" ? t.chatgptSignIn : t.chatgptReconnect}
        disabled={busy}
        onPress={() => void run(async () => {
          setCallbackUrl("");
          const url = await start();
          await Linking.openURL(url);
        })}
      />
      {status.status === "pending" ? (
        <>
          <Input
            accessibilityLabel={t.chatgptCallback}
            placeholder={t.chatgptCallback}
            value={callbackUrl}
            onChangeText={setCallbackUrl}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            editable={!busy}
            style={{ writingDirection: "ltr" }}
          />
          <Button
            title={busy ? t.connecting : t.chatgptFinish}
            disabled={busy || !callbackUrl.trim()}
            onPress={() => void run(async () => {
              await finish(callbackUrl);
              setCallbackUrl("");
            })}
          />
        </>
      ) : null}
      {status.status !== "not_connected" ? (
        <Button
          variant="outline"
          title={t.disconnect}
          disabled={busy}
          onPress={() => Alert.alert(t.chatgptDisconnectTitle, t.chatgptDisconnectBody, [
            { text: t.disconnect, style: "destructive", onPress: () => void run(async () => {
              await disconnect();
              setCallbackUrl("");
            }) },
            { text: t.cancel, style: "cancel" }
          ])}
        />
      ) : null}
    </>
  );
}
