import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { Badge, Card, Icon, IconTile, ListRow, type } from "@/components/drift";
import { Button, Input, Segments } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { callsApi, px, setupReady, type PhoneSetup } from "@/lib/phone-calls";
import { pickedVoice } from "@/lib/voice-call";

const failed = (error: unknown) => Alert.alert(px.setup, error instanceof Error ? error.message : t.tryAgain);

// Your Twilio account: SID, auth token (kept on the server only), the number calls come from, and the agent's voice.
export function SetupCard({ setup, onSaved }: { setup: PhoneSetup | null; onSaved: (next: PhoneSetup | null) => void }) {
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState(setup?.from_number ?? "");
  const eleven = setup?.provider === "elevenlabs";
  // ElevenLabs: the voices in the user's account (none loaded: the agent's default voice). OpenAI: its six voices.
  const options = eleven ? (setup?.voice_options ?? []) : (setup?.voices ?? ["marin", "cedar", "ash", "coral", "sage", "verse"]).map((id) => ({ id, name: id, arabic: false }));
  const [voice, setVoice] = useState(pickedVoice(options, setup?.voice) ?? "marin");
  const [busy, setBusy] = useState(false);
  const form = { accountSid, authToken, fromNumber, voice };
  const voiceName = options.find((option) => option.id === setup?.voice)?.name ?? setup?.voice;

  const remove = () =>
    Alert.alert(px.removeTitle, px.removeBody, [
      { text: t.cancel, style: "cancel" },
      { text: px.removeSetup, style: "destructive", onPress: () => void callsApi.removeSetup(getApi()).then(() => onSaved(null)).catch(failed) }
    ]);

  return (
    <Card title={px.setup} action={<Badge tone={setup?.connected ? "success" : "neutral"}>{setup?.connected ? px.connected : px.notConnected}</Badge>}>
      <Text style={type.rowSubtitle}>{px.setupIntro}</Text>
      {setup?.connected ? <ListRow leading={<IconTile name="phone" tone="accent" />} title={setup.from_number ?? ""} subtitle={`AC…${setup.account_hint ?? ""} · ${voiceName}`} trailing={<Pressable onPress={remove} accessibilityRole="button" accessibilityLabel={px.removeSetup} hitSlop={6}><Icon name="trash-2" color={colors.inkMuted} /></Pressable>} /> : null}
      <Input accessibilityLabel={px.accountSid} placeholder={px.accountSid} value={accountSid} onChangeText={setAccountSid} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={px.authToken} placeholder={setup?.connected ? px.tokenSaved : px.authToken} value={authToken} onChangeText={setAuthToken} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ writingDirection: "ltr" }} />
      <Input accessibilityLabel={px.fromNumber} placeholder={px.fromNumber} value={fromNumber} onChangeText={setFromNumber} keyboardType="phone-pad" style={{ writingDirection: "ltr" }} />
      <Text style={type.rowSubtitle}>{px.fromHint}</Text>
      <Text style={type.rowSubtitle}>{px.voice}</Text>
      {eleven ? (
        options.length ? (
          options.map((option) => (
            <ListRow key={option.id} title={option.name} subtitle={option.arabic ? t.callArabic : null} onPress={() => setVoice(option.id)} trailing={voice === option.id ? <Icon name="check" size={16} color={colors.accentDeep} /> : null} />
          ))
        ) : (
          <Text style={type.rowSubtitle}>{t.callVoicesEmpty}</Text>
        )
      ) : (
        <Segments small options={options.map((option) => option.id)} value={voice} onChange={setVoice} />
      )}
      <Button
        title={busy ? px.savingSetup : px.saveSetup}
        disabled={busy || !setupReady(form, setup)}
        onPress={async () => {
          setBusy(true);
          try {
            const next = await callsApi.saveSetup(getApi(), form);
            setAuthToken("");
            onSaved(next);
            Alert.alert(px.setup, t.saved);
          } catch (error) {
            failed(error);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

