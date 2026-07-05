import { describe, expect, it } from "vitest";
import { parseTagInput, tagsForTarget, targetMatchesTag, textMatchesQuery } from "@/lib/tag-actions";
import type { Tag, Tagging } from "@/lib/types";

const tags: Tag[] = [
  { id: "tag-1", user_id: "user-1", name: "fitness", color: null, created_at: "2026-07-01T00:00:00.000Z" },
  { id: "tag-2", user_id: "user-1", name: "research", color: null, created_at: "2026-07-01T00:00:00.000Z" }
];

const taggings: Tagging[] = [
  {
    id: "tagging-1",
    user_id: "user-1",
    tag_id: "tag-1",
    target_type: "capture",
    target_id: "capture-1",
    created_at: "2026-07-01T00:00:00.000Z"
  }
];

describe("tags", () => {
  it("parses comma-separated tags and removes duplicates", () => {
    expect(parseTagInput("fitness, #research, Fitness, ")).toEqual(["fitness", "research"]);
  });

  it("finds tags and tag matches for a target", () => {
    expect(tagsForTarget(tags, taggings, "capture", "capture-1")).toEqual([tags[0]]);
    expect(targetMatchesTag(taggings, "tag-1", "capture", "capture-1")).toBe(true);
    expect(targetMatchesTag(taggings, "tag-2", "capture", "capture-1")).toBe(false);
    expect(targetMatchesTag(taggings, null, "capture", "capture-1")).toBe(true);
  });

  it("matches search text across values", () => {
    expect(textMatchesQuery("tik", ["TikTok idea", null])).toBe(true);
    expect(textMatchesQuery("meal", ["TikTok idea", "Workout"])).toBe(false);
    expect(textMatchesQuery("", [])).toBe(true);
  });
});
