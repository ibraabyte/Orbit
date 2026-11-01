import { useState } from "react";
import { Alert } from "react-native";
import { Button, Input } from "@/components/screen";
import { t } from "@/lib/i18n";

// Address + API key for the user's own Seerr. Used on Movies & TV and on Integrations.
export function SeerrConnectForm({ connect }: { connect: (url: string, apiKey: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Input accessibilityLabel={t.serverUrl} placeholder="https://seerr.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={t.apiKey} placeholder={t.apiKey} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Button
        title={busy ? t.connecting : t.connect}
        disabled={busy || !url.trim() || !key.trim()}
        onPress={async () => {
          setBusy(true);
          try {
            await connect(url, key);
          } catch (error) {
            Alert.alert(t.seerrConnect, error instanceof Error ? error.message : t.tryAgain);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
