import { describe, expect, it } from "vitest";
import { installHelpForUserAgent, isStandaloneDisplay } from "@/lib/pwa-install";

describe("pwa install helpers", () => {
  it("detects standalone display from media query or iOS navigator flag", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false);
  });

  it("returns iOS install guidance", () => {
    expect(installHelpForUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari")).toEqual({
      label: "Use browser share",
      detail: "Open the browser share menu and choose Add to Home Screen."
    });
  });

  it("returns browser-specific install fallback guidance", () => {
    expect(installHelpForUserAgent("Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36").label).toBe("Use browser install");
    expect(installHelpForUserAgent("Mozilla/5.0 Firefox/127.0").label).toBe("Install may be unavailable");
    expect(installHelpForUserAgent("UnknownBrowser").label).toBe("Use browser options");
  });
});
