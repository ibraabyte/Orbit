import { useState } from "react";
import { Alert } from "react-native";
import { Button, Input } from "@/components/screen";

// Address + API key for the user's own Seerr. Used on Movies & TV and on Integrations.
export function SeerrConnectForm({ connect }: { connect: (url: string, apiKey: string) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Input placeholder="https://seerr.example.com" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <Input placeholder="API key (Seerr → Settings → General)" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry />
      <Button
        title={busy ? "Checking…" : "Connect"}
        disabled={busy || !url.trim() || !key.trim()}
        onPress={async () => {
          setBusy(true);
          try {
            await connect(url, key);
          } catch (error) {
            Alert.alert("Could not connect", error instanceof Error ? error.message : "Check the URL and key.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
