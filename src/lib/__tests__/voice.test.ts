import { describe, expect, it } from "vitest";
import { defaultVoiceLang, voiceErrorKey, withSpoken } from "@/lib/voice";

describe("the assistant's mic", () => {
  it("listens in the app's language to start with", () => {
    expect(defaultVoiceLang(true)).toBe("ar-SA");
    expect(defaultVoiceLang(false)).toBe("en-US");
  });

  it("says nothing when the person stopped or said nothing, and explains real problems", () => {
    for (const code of ["aborted", "no-speech", "speech-timeout"]) expect(voiceErrorKey(code)).toBeNull();
    expect(voiceErrorKey("not-allowed")).toBe("micDenied");
    expect(voiceErrorKey("service-not-allowed")).toBe("micDenied");
    // On-device only: a language the phone can't do offline is "unavailable", never sent to a server instead.
    expect(voiceErrorKey("language-not-supported")).toBe("micUnavailable");
    expect(voiceErrorKey("network")).toBe("micUnavailable");
    expect(voiceErrorKey("busy")).toBe("micFailed");
  });

  it("adds what was heard after what was already typed", () => {
    expect(withSpoken("", " غداء 45 ")).toBe("غداء 45");
    expect(withSpoken("ذكرني ", "بكرة 9 اتصل")).toBe("ذكرني بكرة 9 اتصل");
  });
});
