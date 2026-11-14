import { describe, expect, it } from "vitest";
import { addTag, categoryCounts, categoryLabel, categoryList, filterSaved, findLink, fold, inOrder, isWorking, megabytes, picturesOf, posterOf, sharedFiles, sharedLink, sharedText, siteLabel, videoOf, withSaved } from "@/lib/saver";
import type { Capture, SavedMedia } from "@/lib/types";

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
    labels: [],
    analysis: null,
    search_terms: null,
    content_text: null,
    author: null,
    analysis_status: "none",
    analysis_error: null,
    media_error: null,
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

  it("finds an item by what the AI saw in it, its tags, the post's text and its search words", () => {
    const rows = [
      saved({ id: "cook", title: "IMG_0001", labels: ["طبخ"], analysis: "Rice and chicken in one pot.", search_terms: "kabsa · وصفة · recipe" }),
      saved({ id: "tweet", title: "Tweet", content_text: "Morning run by the corniche", author: "Made Up" })
    ];
    const find = (query: string) => filterSaved(rows, { category: null, status: "all", query }).map((row) => row.id);
    expect(find("طبخ")).toEqual(["cook"]);
    expect(find("وصفه")).toEqual(["cook"]); // ة typed as ه
    expect(find("one pot")).toEqual(["cook"]);
    expect(find("corniche")).toEqual(["tweet"]);
    expect(find("made up")).toEqual(["tweet"]);
    expect(find("الطبخ")).toEqual(["cook"]); // "the cooking" finds the "cooking" tag
  });

  const media = (overrides: Partial<SavedMedia>): SavedMedia => ({ id: "m", kind: "image", poster: false, content_type: "image/jpeg", size_bytes: 100, url: "/captures/media/m?exp=1&sig=s", ...overrides });

  it("picks the still for lists and keeps it out of the pictures when there is a video", () => {
    const withVideo = { media: [media({ id: "v", kind: "video" }), media({ id: "p", poster: true }), media({ id: "i" })] };
    expect(posterOf(withVideo)?.id).toBe("p");
    expect(videoOf(withVideo)?.id).toBe("v");
    expect(picturesOf(withVideo).map((item) => item.id)).toEqual(["i"]);
    expect(posterOf({ media: [media({ id: "only" })] })?.id).toBe("only");
    expect(posterOf({ media: [] })).toBeNull();
    expect(picturesOf({ media: [media({ id: "p", poster: true })] }).map((item) => item.id)).toEqual(["p"]);
  });

  it("reads shared pictures and videos, and leaves other files out", () => {
    const files = sharedFiles({
      files: [
        { path: "/private/var/mobile/share/IMG_1.HEIC", mimeType: "image/heic", fileName: "IMG_1.HEIC" },
        { path: "file:///tmp/clip.mov", mimeType: "video/quicktime", fileName: null },
        { path: "/tmp/doc.pdf", mimeType: "application/pdf", fileName: "doc.pdf" }
      ]
    });
    expect(files).toEqual([
      { uri: "file:///private/var/mobile/share/IMG_1.HEIC", name: "IMG_1.HEIC", type: "image/heic" },
      { uri: "file:///tmp/clip.mov", name: "clip.mov", type: "video/quicktime" }
    ]);
    expect(sharedFiles({ files: null })).toEqual([]);
    expect(sharedFiles(null)).toEqual([]);
  });

  it("saves shared text as a note only when it has no link", () => {
    expect(sharedText({ text: "  فكرة: عشاء عائلي كل جمعة  " })).toBe("فكرة: عشاء عائلي كل جمعة");
    expect(sharedText({ text: "see https://x.com/a/status/1" })).toBeNull();
    expect(sharedText({ text: "a title", webUrl: "https://example.com" })).toBeNull();
    expect(sharedText({ text: "  " })).toBeNull();
  });

  it("adds tags once, without #, and knows when the server is still working", () => {
    expect(addTag(["طبخ"], " #عشاء ")).toEqual(["طبخ", "عشاء"]);
    const tags = ["Gym"];
    expect(addTag(tags, "gym")).toBe(tags);
    expect(addTag(tags, "   ")).toBe(tags);
    expect(isWorking([saved({ analysis_status: "done" }), saved({ analysis_status: "pending" })])).toBe(true);
    expect(isWorking([saved({ analysis_status: "failed" })])).toBe(false);
  });

  it("orders search-by-meaning results as the server ranked them", () => {
    const rows = [saved({ id: "a" }), saved({ id: "b" }), saved({ id: "c" })];
    expect(inOrder(rows, ["c", "gone", "a"]).map((row) => row.id)).toEqual(["c", "a"]);
    expect(megabytes(5 * 1024 * 1024 + 300000)).toBe("5.3");
    expect(megabytes(null)).toBeNull();
  });
});
