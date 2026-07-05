import { describe, expect, it } from "vitest";
import { sourceAliases, sourceFromUrl, sourceLabel, sourcePlatformFromHost } from "@/lib/url";

describe("sourceFromUrl", () => {
  it("extracts a compact hostname", () => {
    expect(sourceFromUrl("https://www.tiktok.com/@orbit/video/1")).toBe("tiktok.com");
  });

  it("canonicalizes common social source variants", () => {
    expect(sourceFromUrl("https://mobile.twitter.com/orbit/status/1")).toBe("x.com");
    expect(sourceFromUrl("https://youtu.be/video-id")).toBe("youtube.com");
    expect(sourcePlatformFromHost("vm.tiktok.com")?.label).toBe("TikTok");
    expect(sourceLabel("x.com")).toBe("X / Twitter");
    expect(sourceAliases("x.com")).toContain("twitter");
  });

  it("returns null for missing or invalid URLs", () => {
    expect(sourceFromUrl(null)).toBeNull();
    expect(sourceFromUrl("not a url")).toBeNull();
  });
});
