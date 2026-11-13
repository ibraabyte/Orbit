import { useState } from "react";
import { Alert, Text } from "react-native";
import { type } from "@/components/drift";
import { Button, Input, Segments } from "@/components/screen";
import { t } from "@/lib/i18n";
import { VOICE_DEFAULT_MODELS, VOICE_PROVIDER_NAMES, VOICE_PROVIDERS, voiceFormReady, type VoiceConnectInput, type VoiceProvider, type VoiceStatus } from "@/lib/integrations";

// The user's own speech-to-text model: provider, key and (optional) model. One at a time; saving another replaces it.
export function VoiceConnectForm({ status, connect }: { status: VoiceStatus; connect: (input: VoiceConnectInput) => Promise<void> }) {
  const [provider, setProviderState] = useState<VoiceProvider>(status.provider ?? "openai");
  const savedModel = (name: VoiceProvider) => (status.provider === name && status.model !== VOICE_DEFAULT_MODELS[name] ? status.model ?? "" : "");
  const [model, setModel] = useState(savedModel(provider));
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const keySaved = status.connected && status.provider === provider;
  const setProvider = (next: VoiceProvider) => {
    setProviderState(next);
    setModel(savedModel(next));
    setApiKey("");
  };

  return (
    <>
      <Segments small options={VOICE_PROVIDERS} labels={VOICE_PROVIDER_NAMES} value={provider} onChange={setProvider} />
      <Input accessibilityLabel={t.apiKey} placeholder={keySaved ? t.aiKeySaved : t.apiKey} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={t.aiModel} placeholder={t.voiceModelPh.replace("{model}", VOICE_DEFAULT_MODELS[provider])} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} />
      <Text style={type.rowSubtitle}>{t.voicePrivacy}</Text>
      <Button
        title={busy ? t.connecting : keySaved ? t.save : t.connect}
        disabled={busy || !voiceFormReady({ provider, apiKey }, keySaved ? provider : null)}
        onPress={async () => {
          setBusy(true);
          try {
            await connect({ provider, model, apiKey });
            setApiKey("");
            Alert.alert(t.voiceModel, t.saved);
          } catch (error) {
            Alert.alert(t.voiceModel, error instanceof Error ? error.message : t.tryAgain);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
