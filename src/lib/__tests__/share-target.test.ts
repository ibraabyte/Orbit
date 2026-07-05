import { describe, expect, it } from "vitest";
import { extractFirstUrl, normalizeSharedCapture } from "@/lib/share-target";

describe("share target", () => {
  it("extracts the first URL from shared text", () => {
    expect(extractFirstUrl("Read this https://example.com/post today")).toBe("https://example.com/post");
  });

  it("normalizes shared links", () => {
    expect(
      normalizeSharedCapture({
        title: "Useful thread",
        text: "Worth saving https://x.com/thread",
        url: null
      })
    ).toEqual({
      type: "link",
      title: "Useful thread",
      url: "https://x.com/thread",
      note: "Worth saving",
      tags: "shared"
    });
  });

  it("normalizes shared plain text as a note", () => {
    expect(normalizeSharedCapture({ text: "Remember this idea" })).toMatchObject({
      type: "note",
      title: "Remember this idea",
      url: "",
      note: "Remember this idea"
    });
  });

  it("normalizes shared image files as screenshots", () => {
    expect(normalizeSharedCapture({ fileName: "progress-photo.webp" })).toEqual({
      type: "screenshot",
      title: "progress-photo.webp",
      url: "",
      note: "",
      tags: "shared, screenshot"
    });
  });

  it("normalizes multiple shared image files as one screenshot capture", () => {
    expect(normalizeSharedCapture({ fileNames: ["front.png", "back.png", "receipt.png"] })).toEqual({
      type: "screenshot",
      title: "3 shared screenshots",
      url: "",
      note: "",
      tags: "shared, screenshot"
    });
  });

  it("bounds direct shared title, text, and URL fields", () => {
    const draft = normalizeSharedCapture({
      title: "T".repeat(500),
      text: "N".repeat(12000),
      url: `https://example.com/${"u".repeat(3000)}`
    });

    expect(draft.title).toHaveLength(280);
    expect(draft.note).toHaveLength(10000);
    expect(draft.url).toHaveLength(2048);
  });
});
