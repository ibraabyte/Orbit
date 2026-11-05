// Speech-to-text settings and messages for the assistant's mic. The recognizer itself is in hooks/use-voice.ts.

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
