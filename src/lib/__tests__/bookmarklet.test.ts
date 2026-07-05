import { describe, expect, it } from "vitest";
import { buildCaptureBookmarklet, normalizeBookmarkletOrigin } from "@/lib/bookmarklet";

describe("bookmarklet", () => {
  it("normalizes the app origin before building the shortcut", () => {
    expect(normalizeBookmarkletOrigin("https://orbit.example.com/settings?x=1")).toBe("https://orbit.example.com");
    expect(normalizeBookmarkletOrigin("not a url")).toBe("");
  });

  it("builds a capture bookmarklet pointed at the share target", () => {
    const bookmarklet = buildCaptureBookmarklet("https://orbit.example.com/settings");

    expect(bookmarklet.startsWith("javascript:")).toBe(true);
    expect(bookmarklet).toContain("https://orbit.example.com/share-target");
    expect(bookmarklet).toContain("document.title");
    expect(bookmarklet).toContain("location.href");
    expect(bookmarklet).toContain("getSelection");
    expect(bookmarklet).toContain("encodeURIComponent");
  });

  it("returns an empty shortcut for invalid origins", () => {
    expect(buildCaptureBookmarklet("")).toBe("");
  });
});
