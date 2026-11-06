import { describe, expect, it } from "vitest";
import { categoryCounts, categoryLabel, categoryList, filterSaved, findLink, fold, sharedLink, siteLabel, withSaved } from "@/lib/saver";
import type { Capture } from "@/lib/types";

function saved(overrides: Partial<Capture>): Capture {
  return {
    id: "c1",
    user_id: "user-1",
    type: "link",
    url: "https://example.com/a",
    title: "Something",
    note: null,
    source: "example.com",
    category: "other",
    status: "want",
    image_url: null,
    site_name: null,
    summary: null,
    created_at: "2026-11-05T00:00:00.000Z",
    ...overrides
  };
}

describe("saver", () => {
  it("finds the link inside shared text and drops trailing punctuation", () => {
    expect(findLink("Look at this! https://vm.tiktok.com/ZSmadeup/ 😂")).toBe("https://vm.tiktok.com/ZSmadeup/");
    expect(findLink("شوف هذا (https://x.com/madeup/status/1).")).toBe("https://x.com/madeup/status/1");
    expect(findLink("just words")).toBeNull();
    expect(findLink(null)).toBeNull();
  });

  it("reads what the share sheet sent", () => {
    expect(sharedLink({ webUrl: "https://youtu.be/abc", meta: { title: " A video " } })).toEqual({ url: "https://youtu.be/abc", title: "A video" });
    expect(sharedLink({ text: "Check https://www.tiktok.com/@a/video/1 now" })).toEqual({ url: "https://www.tiktok.com/@a/video/1", title: null });
    expect(sharedLink({ text: "no link here" })).toBeNull();
    expect(sharedLink(null)).toBeNull();
  });

  it("lists built-in categories first, then the user's own once each", () => {
    const list = categoryList([saved({ category: "Recipes" }), saved({ category: "video" }), saved({ category: "Gifts" }), saved({ category: "Recipes" })], ["Trips", " "]);
    expect(list).toEqual(["video", "post", "book", "movie", "article", "place", "other", "Gifts", "Recipes", "Trips"]);
    expect(categoryLabel("Recipes")).toBe("Recipes");
    expect(categoryLabel("movie")).toBe("Movies");
  });

  it("counts by category for the chosen status", () => {
    const rows = [saved({ category: "video" }), saved({ category: "video", status: "done" }), saved({ category: "book" })];
    expect(Object.fromEntries(categoryCounts(rows, "want"))).toEqual({ video: 1, book: 1 });
    expect(categoryCounts(rows).get("video")).toBe(2);
  });

  it("filters by category, status and words, ignoring Arabic spelling variants", () => {
    const rows = [
      saved({ id: "a", title: "كبسة سريعة", category: "video", site_name: "TikTok" }),
      saved({ id: "b", title: "A calm week", summary: "Five habits", category: "article", status: "done" }),
      saved({ id: "c", title: "مطعم جديد", note: "للعائلة", category: "place" })
    ];
    expect(filterSaved(rows, { category: null, status: "all", query: "" }).map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(filterSaved(rows, { category: "video", status: "want", query: "" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterSaved(rows, { category: null, status: "want", query: "" }).map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterSaved(rows, { category: null, status: "all", query: "tiktok" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterSaved(rows, { category: null, status: "all", query: "habits calm" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterSaved(rows, { category: null, status: "all", query: "للعائله" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterSaved(rows, { category: null, status: "all", query: "places" }).map((row) => row.id)).toEqual(["c"]);
  });

  it("folds Arabic letters typed either way", () => {
    expect(fold("أحمد إلى مكتبة")).toBe(fold("احمد الي مكتبه"));
  });

  it("names the site", () => {
    expect(siteLabel(saved({ site_name: "Made Up Blog" }))).toBe("Made Up Blog");
    expect(siteLabel(saved({ source: null, url: "https://www.example.org/x" }))).toBe("example.org");
  });

  it("puts a save on top without duplicating it", () => {
    const rows = [saved({ id: "a" }), saved({ id: "b" })];
    expect(withSaved(rows, saved({ id: "b", title: "again" })).map((row) => row.id)).toEqual(["b", "a"]);
  });
});
