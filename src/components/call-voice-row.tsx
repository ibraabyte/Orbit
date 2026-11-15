import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { IconMark, PickRow } from "@/components/ai-provider-parts";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { callVoiceKey, pickedVoice, providerOf, voiceLabel, voiceOptions, type CallStatus } from "@/lib/voice-call";

// Advanced › Voice: the call's voice, with every voice the company offers. The call screen asks only the first time.
export function CallVoiceRow() {
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const provider = providerOf(status);

  useEffect(() => {
    getApi()
      .get<CallStatus>("/assistant/call")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    void AsyncStorage.getItem(callVoiceKey(provider))
      .then(setSaved)
      .catch(() => undefined);
  }, [provider]);

  const voices = voiceOptions(status);
  if (!status?.available || voices.length < 2) return null;
  const pick = (id: string) => {
    setSaved(id);
    void AsyncStorage.setItem(callVoiceKey(provider), id).catch(() => undefined);
  };
  return (
    <PickRow
      icon="phone-call"
      title={t.callVoice}
      picks={voices.map((option) => ({ key: option.id, label: voiceLabel(option), mark: <IconMark name="user" size={24} /> }))}
      value={pickedVoice(voices, saved)}
      onPick={pick}
    />
  );
}
