import { describe, expect, it } from "vitest";
import { backdropUrl, canManageRequests, canRequest, createSeerrClient, factLine, factRows, makers, mediaBadge, normalizeSeerrUrl, playUrl, posterUrl, quotaLine, requestBadge, runtimeLabel, seasonBadge, seasonRows, seerrPageUrl, seerrTitle, serverSeerrCall, topCast, trailerUrl } from "@/lib/seerr";

// A stand-in for Orbit's API client: records the calls the app would send to the server.
function fakeServer(responses: Record<string, unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const api = {
    request: async <T,>(method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const key = `${method} ${path}`;
      if (!(key in responses)) throw new Error(`Unexpected ${key}`);
      return responses[key] as T;
    }
  };
  return { seerr: createSeerrClient(serverSeerrCall(api)), calls };
}

describe("seerr", () => {
  it("normalizes the server URL people paste", () => {
    expect(normalizeSeerrUrl("seerr.example.com/")).toBe("https://seerr.example.com");
    expect(normalizeSeerrUrl(" http://10.0.0.5:5055/api/v1 ")).toBe("http://10.0.0.5:5055");
  });

  it("goes through Orbit's server, drops people from search, and asks for all seasons of a series", async () => {
    const base = "/integrations/seerr/api";
    const { seerr, calls } = fakeServer({
      [`GET ${base}/search?query=dune%202&page=1`]: { results: [{ id: 1, mediaType: "movie", title: "Dune: Part Two" }, { id: 2, mediaType: "person", name: "Someone" }] },
      [`POST ${base}/request`]: { id: 9, status: 1 }
    });

    expect((await seerr.search("dune 2")).map((item) => item.id)).toEqual([1]);
    await seerr.request("tv", 1399);
    expect(calls[1].body).toEqual({ mediaType: "tv", mediaId: 1399, seasons: "all" });
  });

  it("looks up a request's title by TMDB id and acts on requests", async () => {
    const { seerr, calls } = fakeServer({
      "GET /integrations/seerr/api/tv/1399": { id: 1399, name: "Game of Thrones", firstAirDate: "2011-04-17" },
      "POST /integrations/seerr/api/request/4/approve": { id: 4, status: 2 },
      "DELETE /integrations/seerr/api/request/4": null
    });
    expect(seerrTitle(await seerr.details("tv", 1399))).toBe("Game of Thrones (2011)");
    await seerr.approve(4);
    await seerr.cancel(4);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /integrations/seerr/api/tv/1399",
      "POST /integrations/seerr/api/request/4/approve",
      "DELETE /integrations/seerr/api/request/4"
    ]);
  });

  it("reads admin rights from the permission bits", () => {
    expect(canManageRequests({ permissions: 2 })).toBe(true);
    expect(canManageRequests({ permissions: 16 | 32 })).toBe(true);
    expect(canManageRequests({ permissions: 32 })).toBe(false);
  });

  it("formats titles and posters", () => {
    expect(seerrTitle({ name: "Shogun", firstAirDate: "2024-02-27" })).toBe("Shogun (2024)");
    expect(posterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
    expect(posterUrl(null)).toBeNull();
  });
});

describe("seerr details", () => {
  it("builds discover, genre, season, cast and request paths, and fills in a missing media type", async () => {
    const base = "/integrations/seerr/api";
    const { seerr, calls } = fakeServer({
      [`GET ${base}/discover/movies/upcoming?page=2`]: { page: 2, totalPages: 3, results: [{ id: 5 }, { id: 5 }, { id: 6, mediaType: "movie" }] },
      [`GET ${base}/discover/tv/genre/18?page=1`]: { page: 1, totalPages: 1, results: [{ id: 8 }] },
      [`GET ${base}/tv/8/season/2`]: { seasonNumber: 2, episodes: [{ id: 1, episodeNumber: 1, seasonNumber: 2 }] },
      [`GET ${base}/person/31/combined_credits`]: { cast: [{ id: 1, mediaType: "movie", releaseDate: "2001-01-01" }, { id: 2, mediaType: "tv", firstAirDate: "2020-01-01" }], crew: [{ id: 1, mediaType: "movie" }] },
      [`POST ${base}/request`]: { id: 9, status: 1 },
      [`POST ${base}/request/9/retry`]: { id: 9, status: 2 },
      [`GET ${base}/request?take=20&skip=40&filter=processing&sort=added`]: { pageInfo: { pages: 3, page: 3, results: 41 }, results: [] }
    });
    const upcoming = await seerr.discover({ row: "upcomingMovies" }, 2);
    expect(upcoming.results.map((item) => [item.id, item.mediaType])).toEqual([[5, "movie"], [6, "movie"]]);
    expect((await seerr.discover({ row: "genre", kind: "tv", genreId: 18 })).results[0].mediaType).toBe("tv");
    expect((await seerr.season(8, 2)).episodes).toHaveLength(1);
    expect((await seerr.personCredits(31)).map((item) => item.id)).toEqual([2, 1]);
    await seerr.request("tv", 8, [1, 3]);
    expect(calls.at(-1)?.body).toEqual({ mediaType: "tv", mediaId: 8, seasons: [1, 3] });
    await seerr.request("movie", 5);
    expect(calls.at(-1)?.body).toEqual({ mediaType: "movie", mediaId: 5 });
    await seerr.retry(9);
    expect((await seerr.requestPage("processing", 40)).pageInfo.pages).toBe(3);
  });

  it("marks each season as on the server, asked for, or free to request", () => {
    const rows = seasonRows({
      seasons: [{ seasonNumber: 0, name: "Specials" }, { seasonNumber: 2 }, { seasonNumber: 1 }, { seasonNumber: 3 }, { seasonNumber: 4 }],
      mediaInfo: {
        status: 4,
        seasons: [{ seasonNumber: 1, status: 5 }],
        requests: [
          { id: 1, status: 1, createdAt: "", type: "tv", media: { tmdbId: 8, status: 4, mediaType: "tv" }, seasons: [{ seasonNumber: 2 }] },
          { id: 2, status: 3, createdAt: "", type: "tv", media: { tmdbId: 8, status: 4, mediaType: "tv" }, seasons: [{ seasonNumber: 3 }] }
        ]
      }
    });
    expect(rows.map((row) => [row.seasonNumber, row.requestable])).toEqual([[1, false], [2, false], [3, true], [4, true]]);
    expect(seasonBadge(rows[0])?.glyph).toBe("✓");
    expect(seasonBadge(rows[1])?.glyph).toBe("◷");
    expect(seasonBadge(rows[2])).toBeNull();
  });

  it("knows when a title can still be requested", () => {
    expect(canRequest({ mediaType: "movie" })).toBe(true);
    expect(canRequest({ mediaType: "movie", mediaInfo: { status: 5 } })).toBe(false);
    expect(canRequest({ mediaType: "movie", mediaInfo: { status: 2 } })).toBe(false);
    expect(canRequest({ mediaType: "tv", mediaInfo: { status: 4 } })).toBe(true);
    expect(mediaBadge(4)?.label).toBe("Partly available");
    expect(mediaBadge(1)).toBeNull();
    expect(requestBadge(4).glyph).toBe("!");
  });

  it("finds the trailer, the play link and the Seerr page", () => {
    expect(trailerUrl([{ site: "Vimeo", key: "x", type: "Trailer" }, { site: "YouTube", key: "tease", type: "Teaser" }, { site: "YouTube", key: "abc", type: "Trailer" }])).toBe("https://www.youtube.com/watch?v=abc");
    expect(trailerUrl([{ site: "YouTube", key: "tease", type: "Teaser" }])).toBe("https://www.youtube.com/watch?v=tease");
    expect(trailerUrl(undefined)).toBeNull();
    expect(playUrl({ status: 5, mediaUrl: "https://media.example.com/item/1" })).toBe("https://media.example.com/item/1");
    expect(playUrl({ status: 5 })).toBeNull();
    expect(seerrPageUrl("https://seerr.example.com/", "tv", 8)).toBe("https://seerr.example.com/tv/8");
    expect(backdropUrl("/b.jpg")).toBe("https://image.tmdb.org/t/p/w780/b.jpg");
  });

  it("writes the fact line, the facts table, cast and makers", () => {
    const movie = {
      id: 1,
      mediaType: "movie" as const,
      title: "Made Up",
      originalTitle: "Inventé",
      releaseDate: "2024-03-01",
      runtime: 166,
      voteAverage: 8.24,
      status: "Released",
      budget: 190_000_000,
      credits: { cast: [{ id: 2, name: "B", order: 1 }, { id: 1, name: "A", order: 0 }, { id: 1, name: "A", order: 5 }], crew: [{ id: 9, name: "Some Director", job: "Director" }, { id: 8, name: "Writer", job: "Screenplay" }] }
    };
    expect(factLine(movie)).toEqual(["Movie", "2024", "2 h 46 min", "★ 8.2"]);
    expect(factLine({ id: 2, mediaType: "tv", name: "S", numberOfSeasons: 1, episodeRunTime: [45] })).toEqual(["TV", "1 season", "45 min"]);
    expect(topCast(movie).map((person) => person.name)).toEqual(["A", "B"]);
    expect(makers(movie)).toEqual(["Some Director"]);
    expect(makers({ mediaType: "tv", createdBy: [{ id: 1, name: "Creator" }] })).toEqual(["Creator"]);
    const facts = Object.fromEntries(factRows(movie, (day) => `d:${day}`));
    expect(facts).toMatchObject({ Status: "Released", Released: "d:2024-03-01", Director: "Some Director", "Original title": "Inventé", Budget: "$190M" });
    expect(runtimeLabel(45)).toBe("45 min");
    expect(runtimeLabel(120)).toBe("2 h");
  });

  it("says how many requests are left only when there is a limit", () => {
    expect(quotaLine({ limit: 5, used: 2, days: 7 }, "movie")).toBe("3 of 5 movie requests left · every 7 days");
    expect(quotaLine({ limit: 0 }, "tv")).toBeNull();
    expect(quotaLine(undefined, "tv")).toBeNull();
  });
});
