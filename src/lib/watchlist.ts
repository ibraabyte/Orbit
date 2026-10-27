import type { SeerrResult } from "@/lib/seerr";
import { seerrTitle } from "@/lib/seerr";
import type { WatchItem, WatchStatus } from "@/lib/types";

export type WatchDraft = Pick<WatchItem, "tmdb_id" | "media_type" | "title" | "poster_path" | "status" | "season" | "episode">;

// A Seerr search/trending/details result becomes a watch-list row.
export function watchDraftFromSeerr(item: SeerrResult, status: WatchStatus = "want"): WatchDraft | null {
  if (item.mediaType !== "movie" && item.mediaType !== "tv") return null;
  return {
    tmdb_id: item.id,
    media_type: item.mediaType,
    title: seerrTitle(item),
    poster_path: item.posterPath ?? null,
    status,
    season: item.mediaType === "tv" && status === "watching" ? 1 : null,
    episode: item.mediaType === "tv" && status === "watching" ? 1 : null
  };
}

export function progressLabel(item: Pick<WatchItem, "media_type" | "season" | "episode">) {
  if (item.media_type !== "tv" || item.season === null) return null;
  return `S${item.season}${item.episode === null ? "" : ` E${item.episode}`}`;
}

// "Watched one more": next episode, or the next season when asked to roll over.
export function nextEpisode(item: Pick<WatchItem, "season" | "episode">, newSeason = false) {
  if (newSeason) return { season: (item.season ?? 0) + 1, episode: 1 };
  return { season: item.season ?? 1, episode: (item.episode ?? 0) + 1 };
}

export function groupWatchItems(items: WatchItem[]) {
  const byRecent = [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return {
    watching: byRecent.filter((item) => item.status === "watching"),
    want: byRecent.filter((item) => item.status === "want"),
    done: byRecent.filter((item) => item.status === "done")
  };
}
