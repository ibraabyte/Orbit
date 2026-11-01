import { describe, expect, it } from "vitest";
import { canManageRequests, createSeerrClient, normalizeSeerrUrl, posterUrl, seerrTitle, serverSeerrCall } from "@/lib/seerr";

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
