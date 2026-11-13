// Speech-to-text settings and messages for the assistant's mic. The recognizers are in hooks/use-voice.ts (on the
// phone) and hooks/use-cloud-voice.ts (the user's own voice model, through the server).

export type VoiceLang = "ar-SA" | "en-US";

export const defaultVoiceLang = (arabic: boolean): VoiceLang => (arabic ? "ar-SA" : "en-US");

type VoiceErrorKey = "micDenied" | "micUnavailable" | "micFailed";

// Which message an error from the recognizer shows. null: nothing to say (the person stopped, or said nothing).
export function voiceErrorKey(code: string): VoiceErrorKey | null {
  switch (code) {
    case "aborted":
    case "no-speech":
    case "speech-timeout":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "micDenied";
    // On-device only: a language the phone can't do offline, or one that would need the network.
    case "language-not-supported":
    case "network":
      return "micUnavailable";
    default:
      return "micFailed";
  }
}

// What the field shows while speaking: what was typed before the mic started, then the words heard so far.
export function withSpoken(before: string, spoken: string) {
  const head = before.trimEnd();
  return head ? `${head} ${spoken.trim()}` : spoken.trim();
}

// The language the voice model is told, from the mic's language chip.
export const voiceApiLang = (lang: VoiceLang): "ar" | "en" => (lang === "ar-SA" ? "ar" : "en");

// About a minute is plenty for one line to the assistant; the recording stops by itself there.
export const MAX_RECORDING_SECONDS = 60;

// The audio type of a recording, from its file name. The recorder writes .m4a on iPhone and Android.
export function audioMediaType(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "wav": return "audio/wav";
    case "aac": return "audio/aac";
    case "webm": return "audio/webm";
    case "mp3": return "audio/mpeg";
    default: return "audio/m4a";
  }
}

// The base64 part of a data URL (what FileReader gives back).
export const dataUrlBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

// Agreeing to send the voice is kept on this phone, per account, and names the provider: a new provider asks again.
export const voiceConsentKey = (userId: string) => `orbit.voice.consent.${userId}`;
export const voiceConsented = (saved: string | null, provider: string | null) => Boolean(provider) && saved === provider;
