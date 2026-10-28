import { describe, expect, it } from "vitest";
import type { WatchItem } from "@/lib/types";
import { groupWatchItems, nextEpisode, progressLabel, watchDraftFromSeerr } from "@/lib/watchlist";

function item(overrides: Partial<WatchItem>): WatchItem {
  return {
    id: "w1",
    user_id: "user-1",
    tmdb_id: 1,
    media_type: "tv",
    title: "Show",
    poster_path: null,
    status: "want",
    season: null,
    episode: null,
    notes: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides
  };
}

describe("watch list", () => {
  it("turns Seerr results into rows and skips people", () => {
    expect(watchDraftFromSeerr({ id: 1399, mediaType: "tv", name: "Shogun", firstAirDate: "2024-02-27", posterPath: "/p.jpg" }, "watching")).toEqual({
      tmdb_id: 1399,
      media_type: "tv",
      title: "Shogun (2024)",
      poster_path: "/p.jpg",
      status: "watching",
      season: 1,
      episode: 1
    });
    expect(watchDraftFromSeerr({ id: 5, mediaType: "movie", title: "Dune" })?.season).toBeNull();
    expect(watchDraftFromSeerr({ id: 7, mediaType: "person", name: "Someone" })).toBeNull();
  });

  it("labels and advances series progress", () => {
    expect(progressLabel(item({ season: 2, episode: 5 }))).toBe("S2 E5");
    expect(progressLabel(item({ media_type: "movie", season: 1 }))).toBeNull();
    expect(nextEpisode({ season: 2, episode: 5 })).toEqual({ season: 2, episode: 6 });
    expect(nextEpisode({ season: 2, episode: 10 }, true)).toEqual({ season: 3, episode: 1 });
  });

  it("groups by status, most recently touched first", () => {
    const groups = groupWatchItems([
      item({ id: "a", status: "watching", updated_at: "2026-10-02T00:00:00.000Z" }),
      item({ id: "b", status: "watching", updated_at: "2026-10-05T00:00:00.000Z" }),
      item({ id: "c", status: "done" })
    ]);
    expect(groups.watching.map((row) => row.id)).toEqual(["b", "a"]);
    expect(groups.want).toEqual([]);
    expect(groups.done.map((row) => row.id)).toEqual(["c"]);
  });
});
