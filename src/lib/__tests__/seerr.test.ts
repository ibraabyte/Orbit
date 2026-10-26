import { describe, expect, it } from "vitest";
import { canManageRequests, createSeerrClient, normalizeSeerrUrl, posterUrl, seerrTitle } from "@/lib/seerr";

function fakeFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const match = responses[`${init.method ?? "GET"} ${url}`] ?? { status: 404 };
    const status = match.status ?? 200;
    return { ok: status < 400, status, json: async () => match.body } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("seerr", () => {
  it("normalizes the server URL people paste", () => {
    expect(normalizeSeerrUrl("seerr.example.com/")).toBe("https://seerr.example.com");
    expect(normalizeSeerrUrl(" http://10.0.0.5:5055/api/v1 ")).toBe("http://10.0.0.5:5055");
  });

  it("sends the key, drops people from search, and asks for all seasons of a series", async () => {
    const base = "https://seerr.example.com/api/v1";
    const { fetcher, calls } = fakeFetch({
      [`GET ${base}/search?query=dune%202&page=1`]: { body: { results: [{ id: 1, mediaType: "movie", title: "Dune: Part Two" }, { id: 2, mediaType: "person", name: "Zendaya" }] } },
      [`POST ${base}/request`]: { status: 201, body: { id: 9, status: 1 } }
    });
    const seerr = createSeerrClient({ url: "seerr.example.com", apiKey: "k" }, fetcher);

    expect((await seerr.search("dune 2")).map((item) => item.id)).toEqual([1]);
    await seerr.request("tv", 1399);
    expect(calls[0].init.headers).toMatchObject({ "X-Api-Key": "k" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ mediaType: "tv", mediaId: 1399, seasons: "all" });
  });

  it("explains a rejected key", async () => {
    const { fetcher } = fakeFetch({ "GET https://s.example/api/v1/auth/me": { status: 401 } });
    await expect(createSeerrClient({ url: "https://s.example", apiKey: "bad" }, fetcher).me()).rejects.toThrow("rejected the API key");
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
