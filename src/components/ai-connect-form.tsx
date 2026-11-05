import { useState } from "react";
import { Alert, Text } from "react-native";
import { type } from "@/components/drift";
import { Button, Input, Segments } from "@/components/screen";
import { t } from "@/lib/i18n";
import { AI_PROVIDER_NAMES, AI_PROVIDERS, aiFormReady, type AiChoice, type AiConnectInput, type AiProvider, type AiStatus } from "@/lib/integrations";

// The user's own AI: provider, key, model and instructions. Each provider keeps its own key, so adding a second one
// never replaces the first. Starts from what's saved for the chosen provider, so they can change one thing.
export function AiConnectForm({ status, saved = [], connect }: { status: AiStatus; saved?: AiChoice[]; connect: (input: AiConnectInput) => Promise<void> }) {
  const savedFor = (name: AiProvider) => saved.find((choice) => choice.provider === name) ?? (status.provider === name ? status : null);
  const [provider, setProviderState] = useState<AiProvider>(status.provider ?? "anthropic");
  const [model, setModel] = useState(savedFor(provider)?.model ?? "");
  const [apiKey, setApiKey] = useState("");
  const [instructions, setInstructions] = useState(savedFor(provider)?.instructions ?? "");
  const [busy, setBusy] = useState(false);
  const keySaved = savedFor(provider) !== null;
  const setProvider = (next: AiProvider) => {
    setProviderState(next);
    setModel(savedFor(next)?.model ?? "");
    setInstructions(savedFor(next)?.instructions ?? "");
    setApiKey("");
  };

  return (
    <>
      <Segments small options={AI_PROVIDERS} labels={AI_PROVIDER_NAMES} value={provider} onChange={setProvider} />
      <Input accessibilityLabel={t.apiKey} placeholder={keySaved ? t.aiKeySaved : t.apiKey} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={t.aiModel} placeholder={provider === "anthropic" ? t.aiModelDefault : t.aiModel} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={t.aiInstructions} placeholder={t.aiInstructions} value={instructions} onChangeText={setInstructions} maxLength={1000} multiline style={{ height: 112 }} />
      <Text style={type.rowSubtitle}>{t.aiPrivacy}</Text>
      <Button
        title={busy ? t.connecting : keySaved ? t.save : t.connect}
        disabled={busy || !aiFormReady({ provider, model, apiKey }, keySaved ? provider : null)}
        onPress={async () => {
          setBusy(true);
          try {
            await connect({ provider, model, apiKey, instructions });
            setApiKey("");
            Alert.alert(t.aiSummary, t.saved);
          } catch (error) {
            Alert.alert(t.aiSummary, error instanceof Error ? error.message : t.tryAgain);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
