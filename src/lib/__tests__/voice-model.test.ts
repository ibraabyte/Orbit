import { describe, expect, it } from "vitest";
import { VOICE_DEFAULT_MODELS, VOICE_PROVIDERS, voiceFormReady, voiceOff, voiceState } from "@/lib/integrations";
import { audioMediaType, dataUrlBase64, voiceApiLang, voiceConsented, voiceConsentKey } from "@/lib/voice";

describe("voice model", () => {
  it("has a default model for every provider", () => {
    for (const provider of VOICE_PROVIDERS) expect(VOICE_DEFAULT_MODELS[provider]).toBeTruthy();
  });

  it("needs a key unless one is saved for the same provider", () => {
    expect(voiceFormReady({ provider: "groq", apiKey: "" }, null)).toBe(false);
    expect(voiceFormReady({ provider: "groq", apiKey: " made-up-key " }, null)).toBe(true);
    expect(voiceFormReady({ provider: "groq", apiKey: "" }, "groq")).toBe(true);
    // A saved OpenAI key never stands in for ElevenLabs.
    expect(voiceFormReady({ provider: "elevenlabs", apiKey: "" }, "openai")).toBe(false);
  });

  it("shows off or the provider and model", () => {
    expect(voiceState(undefined).tone).toBe("neutral");
    expect(voiceState(voiceOff).tone).toBe("neutral");
    const on = voiceState({ connected: true, provider: "elevenlabs", model: "scribe_v1", connected_at: null });
    expect(on.tone).toBe("success");
    expect(on.detail).toBe("ElevenLabs · scribe_v1");
  });

  it("asks again for a new provider", () => {
    expect(voiceConsented(null, "openai")).toBe(false);
    expect(voiceConsented("openai", "openai")).toBe(true);
    expect(voiceConsented("openai", "groq")).toBe(false);
    expect(voiceConsented("openai", null)).toBe(false);
    expect(voiceConsentKey("u1")).not.toBe(voiceConsentKey("u2"));
  });

  it("tells the provider the chip's language and the file's type", () => {
    expect(voiceApiLang("ar-SA")).toBe("ar");
    expect(voiceApiLang("en-US")).toBe("en");
    expect(audioMediaType("file:///tmp/rec-1.m4a")).toBe("audio/m4a");
    expect(audioMediaType("file:///tmp/rec-1.WAV")).toBe("audio/wav");
    expect(audioMediaType("file:///tmp/rec-1")).toBe("audio/m4a");
    expect(dataUrlBase64("data:audio/mp4;base64,QUJD")).toBe("QUJD");
  });
});
