import { describe, expect, it } from "vitest";
import { attachmentsForCapture, captureCollections, captureMatchesType, captureNeedsTriage, captureSearchFields, captureSource, captureSourceLabel, captureSourceOptions, captureStats, isSocialCapture } from "@/lib/library";
import type { Attachment, Capture, Tag, Tagging } from "@/lib/types";

function capture(overrides: Partial<Capture>): Capture {
  return {
    id: "capture-1",
    user_id: "user-1",
    type: "link",
    url: null,
    title: "Capture",
    note: null,
    source: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function attachment(overrides: Partial<Attachment>): Attachment {
  return {
    id: "attachment-1",
    user_id: "user-1",
    capture_id: "capture-1",
    bucket: "orbit-attachments",
    object_path: "user-1/capture-1/file.png",
    filename: "file.png",
    content_type: "image/png",
    size_bytes: 1200,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function tagging(overrides: Partial<Tagging>): Tagging {
  return {
    id: "tagging-1",
    user_id: "user-1",
    tag_id: "tag-1",
    target_type: "capture",
    target_id: "capture-1",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function tag(overrides: Partial<Tag>): Tag {
  return {
    id: "tag-1",
    user_id: "user-1",
    name: "ideas",
    color: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("library helpers", () => {
  it("normalizes capture sources and identifies social captures", () => {
    expect(captureSource(capture({ url: "https://www.tiktok.com/@orbit/video/1" }))).toBe("tiktok.com");
    expect(captureSource(capture({ source: "mobile.twitter.com" }))).toBe("x.com");
    expect(captureSourceLabel(capture({ source: "x.com" }))).toBe("X / Twitter");
    expect(isSocialCapture(capture({ source: "x.com" }))).toBe(true);
    expect(isSocialCapture(capture({ source: "example.com" }))).toBe(false);
  });

  it("summarizes capture types, attachments, and social sources", () => {
    const captures = [
      capture({ id: "link", type: "link", source: "x.com" }),
      capture({ id: "note", type: "note" }),
      capture({ id: "shot", type: "screenshot" }),
      capture({ id: "attached", type: "link" })
    ];

    expect(captureStats(captures, [attachment({ capture_id: "attached" })])).toEqual({
      total: 4,
      links: 2,
      screenshots: 2,
      notes: 1,
      attachments: 1,
      social: 1,
      needsTriage: 4
    });
  });

  it("builds source filters and matches type filters", () => {
    const captures = [
      capture({ id: "a", source: "x.com" }),
      capture({ id: "b", source: "tiktok.com" }),
      capture({ id: "c", source: "mobile.twitter.com" })
    ];

    expect(captureSourceOptions(captures)).toEqual([
      { source: "x.com", label: "X / Twitter", count: 2 },
      { source: "tiktok.com", label: "TikTok", count: 1 }
    ]);
    expect(captureMatchesType(captures[0], "social")).toBe(true);
    expect(captureMatchesType(capture({ id: "attached", type: "link" }), "screenshot", [attachment({ capture_id: "attached" })])).toBe(true);
    expect(captureMatchesType(capture({ id: "unsorted" }), "needs-triage")).toBe(true);
    expect(captureMatchesType(capture({ id: "noted", note: "Review later" }), "needs-triage")).toBe(false);
    expect(captureNeedsTriage(capture({ id: "tagged" }), [tagging({ target_id: "tagged" })])).toBe(false);
  });

  it("builds visible capture collections from sources and tags", () => {
    const captures = [
      capture({ id: "a", source: "x.com" }),
      capture({ id: "b", source: "mobile.twitter.com" }),
      capture({ id: "c", source: "tiktok.com" }),
      capture({ id: "d", source: "example.com" })
    ];
    const tags = [tag({ id: "tag-ideas", name: "ideas" }), tag({ id: "tag-recipes", name: "recipes" }), tag({ id: "tag-empty", name: "empty" })];
    const taggings = [
      tagging({ id: "tagging-1", tag_id: "tag-ideas", target_id: "a" }),
      tagging({ id: "tagging-2", tag_id: "tag-ideas", target_id: "b" }),
      tagging({ id: "tagging-duplicate", tag_id: "tag-ideas", target_id: "b" }),
      tagging({ id: "tagging-3", tag_id: "tag-recipes", target_id: "c" }),
      tagging({ id: "tagging-task", tag_id: "tag-recipes", target_type: "task", target_id: "task-1" }),
      tagging({ id: "tagging-missing-capture", tag_id: "tag-recipes", target_id: "missing" })
    ];

    expect(captureCollections(captures, tags, taggings)).toContainEqual({ id: "tag:tag-recipes", kind: "tag", value: "tag-recipes", label: "recipes", count: 1 });
    expect(captureCollections(captures, tags, taggings)).not.toContainEqual(expect.objectContaining({ value: "tag-empty" }));
    expect(captureCollections(captures, tags, taggings, 0)).toEqual([]);
    expect(captureCollections(captures, tags, taggings, 4)).toEqual([
      { id: "source:x.com", kind: "source", value: "x.com", label: "X / Twitter", count: 2 },
      { id: "tag:tag-ideas", kind: "tag", value: "tag-ideas", label: "ideas", count: 2 },
      { id: "source:example.com", kind: "source", value: "example.com", label: "example.com", count: 1 },
      { id: "source:tiktok.com", kind: "source", value: "tiktok.com", label: "TikTok", count: 1 }
    ]);
  });

  it("includes attachment filenames in capture search fields", () => {
    const files = [
      attachment({ id: "attachment-1", capture_id: "capture-1", filename: "receipt-july.png" }),
      attachment({ id: "attachment-2", capture_id: "other-capture", filename: "other.png" })
    ];

    expect(attachmentsForCapture(files, "capture-1").map((file) => file.filename)).toEqual(["receipt-july.png"]);
    expect(captureSearchFields(capture({ id: "capture-1", source: "x.com", url: "https://x.com/example" }), files)).toContain("receipt-july.png");
    expect(captureSearchFields(capture({ id: "capture-1", source: "x.com", url: "https://x.com/example" }), files)).toContain("X / Twitter");
    expect(captureSearchFields(capture({ id: "capture-1", source: "x.com", url: "https://x.com/example" }), files)).toContain("twitter");
    expect(captureSearchFields(capture({ id: "capture-1", source: "x.com", url: "https://x.com/example" }), files).filter((field) => field === "x.com")).toHaveLength(1);
  });
});
