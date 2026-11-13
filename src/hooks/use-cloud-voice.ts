import { useCallback, useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { integrationsApi } from "@/lib/integrations";
import { audioMediaType, dataUrlBase64, MAX_RECORDING_SECONDS, voiceApiLang, type VoiceLang } from "@/lib/voice";

type Audio = typeof import("expo-audio");

// Loaded once, lazily: an installed build from before this feature has no native audio module, and the assistant must
// still open there (it then keeps using the phone's own speech to text).
function loadAudio(): Audio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as Audio;
  } catch {
    return null;
  }
}
const audio = loadAudio();
export const cloudVoiceAvailable = audio !== null;

// One mono channel is all speech needs, and keeps the upload small.
const preset = audio ? { ...audio.RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 } : null;

// `audio` never changes while the app runs, so this calls the same hooks on every render.
function useRecorder() {
  return audio && preset ? audio.useAudioRecorder(preset) : null;
}

async function readBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t.micFailed));
    reader.onload = () => resolve(dataUrlBase64(String(reader.result)));
    reader.readAsDataURL(blob);
  });
}

// The user's own voice model: records on the phone, sends the recording through the Orbit server to their provider,
// and hands back the text. The recording file is the recorder's own temporary file; nothing else keeps it.
export function useCloudVoice(onText: (text: string) => void) {
  const recorder = useRecorder();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lang = useRef<VoiceLang>("ar-SA");
  const textHandler = useRef(onText);
  textHandler.current = onText;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!recorder || !recorder.isRecording) return setRecording(false);
    setRecording(false);
    setTranscribing(true);
    try {
      await recorder.stop();
      await audio?.setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error(t.micFailed);
      const { text } = await integrationsApi.transcribe(getApi(), await readBase64(uri), audioMediaType(uri), voiceApiLang(lang.current));
      if (text.trim()) textHandler.current(text.trim());
      else setError(t.micNothingHeard);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.micFailed);
    } finally {
      setTranscribing(false);
    }
  }, [recorder]);

  const start = useCallback(
    async (language: VoiceLang) => {
      setError(null);
      if (!audio || !recorder) return setError(t.micNeedsBuild);
      try {
        const permission = await audio.requestRecordingPermissionsAsync();
        if (!permission.granted) return setError(t.micDeniedRecord);
        await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        lang.current = language;
        recorder.record();
        setRecording(true);
        // Stops by itself after a minute, and sends what it has.
        timer.current = setTimeout(() => void stop(), MAX_RECORDING_SECONDS * 1000);
      } catch {
        setRecording(false);
        setError(t.micFailed);
      }
    },
    [recorder, stop]
  );

  // Leaving the screen mid-recording throws the recording away; nothing is sent.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      try {
        if (recorder?.isRecording) void recorder.stop().catch(() => undefined);
      } catch {
        // Already released with the screen.
      }
    },
    [recorder]
  );

  return { recording, transcribing, error, start, stop, clearError: () => setError(null) };
}
