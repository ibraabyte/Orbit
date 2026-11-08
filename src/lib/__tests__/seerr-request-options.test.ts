import { describe, expect, it } from "vitest";
import { canRequest, canRequest4k, canRequestAdvanced, chosenService, createSeerrClient, DEFAULT_CHOICE, requestBody, seasonRows, serverSeerrCall, servicesFor, type SeerrService } from "@/lib/seerr";

const radarr: SeerrService[] = [
  { id: 0, name: "Radarr", is4k: false, isDefault: false, activeProfileId: 4, activeDirectory: "/movies" },
  { id: 1, name: "Radarr Main", is4k: false, isDefault: true, activeProfileId: 6, activeDirectory: "/films" },
  { id: 2, name: "Radarr 4K", is4k: true, isDefault: true, activeProfileId: 5, activeDirectory: "/movies-4k" }
];

describe("request quality options", () => {
  it("offers profile, server and folder only to people Seerr allows advanced requests", () => {
    expect(canRequestAdvanced(null)).toBe(false);
    expect(canRequestAdvanced({ permissions: 32 })).toBe(false); // request only
    expect(canRequestAdvanced({ permissions: 32 | 8192 })).toBe(true); // advanced requests
    expect(canRequestAdvanced({ permissions: 16 })).toBe(true); // manage requests
    expect(canRequestAdvanced({ permissions: 2 })).toBe(true); // admin
  });

  it("offers 4K by Seerr's 4K permissions, per kind", () => {
    expect(canRequest4k({ permissions: 32 }, "movie")).toBe(false);
    expect(canRequest4k({ permissions: 1024 }, "tv")).toBe(true);
    expect(canRequest4k({ permissions: 2048 }, "movie")).toBe(true);
    expect(canRequest4k({ permissions: 2048 }, "tv")).toBe(false);
    expect(canRequest4k({ permissions: 4096 }, "tv")).toBe(true);
    expect(canRequest4k({ permissions: 2 }, "movie")).toBe(true);
  });

  it("lists standard or 4K servers with the default first, and falls back to it", () => {
    expect(servicesFor(radarr, false).map((service) => service.id)).toEqual([1, 0]);
    expect(servicesFor(radarr, true).map((service) => service.id)).toEqual([2]);
    expect(chosenService(radarr, { is4k: false, serverId: null })?.id).toBe(1);
    expect(chosenService(radarr, { is4k: false, serverId: 0 })?.id).toBe(0);
    // A standard server id doesn't carry over to 4K.
    expect(chosenService(radarr, { is4k: true, serverId: 0 })?.id).toBe(2);
    expect(chosenService([], { is4k: true, serverId: null })).toBeNull();
  });

  it("sends only what was picked, and the advanced fields only when allowed", () => {
    expect(requestBody("movie", 7, "all")).toEqual({ mediaType: "movie", mediaId: 7 });
    expect(requestBody("tv", 5, [1, 2])).toEqual({ mediaType: "tv", mediaId: 5, seasons: [1, 2] });
    const picked = { is4k: true, serverId: 2, profileId: 9, rootFolder: "/movies-4k" };
    expect(requestBody("movie", 7, "all", picked, true)).toEqual({ mediaType: "movie", mediaId: 7, is4k: true, serverId: 2, profileId: 9, rootFolder: "/movies-4k" });
    expect(requestBody("movie", 7, "all", picked, false)).toEqual({ mediaType: "movie", mediaId: 7, is4k: true });
    expect(requestBody("tv", 5, "all", { ...DEFAULT_CHOICE, serverId: 1, profileId: 3 }, true)).toEqual({ mediaType: "tv", mediaId: 5, seasons: "all", serverId: 1, profileId: 3 });
  });

  it("asks Seerr for Radarr servers for movies and Sonarr for series, through Orbit's server", async () => {
    const calls: string[] = [];
    const api = { request: async <T,>(method: string, path: string) => (calls.push(`${method} ${path}`), [] as T) };
    const seerr = createSeerrClient(serverSeerrCall(api));
    await seerr.services("movie");
    await seerr.services("tv");
    await seerr.service("tv", 3);
    expect(calls).toEqual(["GET /integrations/seerr/api/service/radarr", "GET /integrations/seerr/api/service/sonarr", "GET /integrations/seerr/api/service/sonarr/3"]);
  });

  it("judges standard and 4K separately", () => {
    const item = { mediaType: "movie" as const, mediaInfo: { status: 5 as const, status4k: 1 as const } };
    expect(canRequest(item)).toBe(false);
    expect(canRequest(item, true)).toBe(true);
    expect(canRequest({ mediaType: "movie", mediaInfo: { status: 1, status4k: 3 } }, true)).toBe(false);

    const series = {
      seasons: [{ id: 1, seasonNumber: 1 }, { id: 2, seasonNumber: 2 }],
      mediaInfo: {
        status: 4 as const,
        seasons: [{ seasonNumber: 1, status: 5 as const, status4k: 1 as const }],
        requests: [{ id: 3, status: 2 as const, createdAt: "2026-01-01", type: "tv" as const, is4k: true, media: { tmdbId: 5, status: 4 as const, mediaType: "tv" as const }, seasons: [{ seasonNumber: 2 }] }]
      }
    };
    expect(seasonRows(series).map((row) => row.requestable)).toEqual([false, true]);
    expect(seasonRows(series, true).map((row) => row.requestable)).toEqual([true, false]);
  });
});
