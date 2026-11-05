import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpoSpeechRecognitionErrorEvent, ExpoSpeechRecognitionResultEvent } from "expo-speech-recognition";
import { t } from "@/lib/i18n";
import { voiceErrorKey, type VoiceLang } from "@/lib/voice";

type Speech = typeof import("expo-speech-recognition");

// Loaded lazily: Expo Go has no native speech module, and the rest of the app must still open there.
function loadSpeech(): Speech | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition") as Speech;
  } catch {
    return null;
  }
}

// Speech to text on the phone itself. Recognition is asked to stay on the device (requiresOnDeviceRecognition), so no
// audio goes to Apple's, Google's or anyone's servers; when the phone can't do that for the language, it says so.
export function useVoice(onText: (text: string, final: boolean) => void) {
  const speech = useRef<Speech | null | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textHandler = useRef(onText);
  textHandler.current = onText;

  useEffect(() => {
    const module = (speech.current = loadSpeech())?.ExpoSpeechRecognitionModule;
    if (!module) return;
    const subscriptions = [
      module.addListener("start", () => setListening(true)),
      module.addListener("end", () => setListening(false)),
      module.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        const text = event.results[0]?.transcript ?? "";
        if (text) textHandler.current(text, event.isFinal);
      }),
      module.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        setListening(false);
        const key = voiceErrorKey(event.error);
        if (key) setError(t[key]);
      })
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      module.abort();
    };
  }, []);

  const start = useCallback(async (lang: VoiceLang) => {
    setError(null);
    const module = speech.current?.ExpoSpeechRecognitionModule;
    if (!module) return setError(t.micNeedsBuild);
    try {
      const permission = await module.requestPermissionsAsync();
      if (!permission.granted) return setError(t.micDenied);
      if (!module.supportsOnDeviceRecognition()) return setError(t.micUnavailable);
      module.start({ lang, interimResults: true, continuous: false, requiresOnDeviceRecognition: true, addsPunctuation: true, iosTaskHint: "dictation" });
    } catch {
      setListening(false);
      setError(t.micFailed);
    }
  }, []);

  const stop = useCallback(() => speech.current?.ExpoSpeechRecognitionModule.stop(), []);

  return { listening, error, start, stop, clearError: () => setError(null) };
}
