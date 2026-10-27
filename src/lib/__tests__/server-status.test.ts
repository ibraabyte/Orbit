import { describe, expect, it } from "vitest";
import { checkServer, normalizeServerUrl, statusChanges, type ServerCheck } from "@/lib/server-status";

const server = { id: "plex", name: "Plex", url: "https://plex.example" };
const respond = (status: number) => (async () => ({ status }) as Response) as unknown as typeof fetch;

describe("server status", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeServerUrl("seerr.example.com/")).toBe("https://seerr.example.com");
    expect(normalizeServerUrl("http://10.0.0.2:32400")).toBe("http://10.0.0.2:32400");
  });

  it("treats a login page as up and a 5xx as down", async () => {
    expect((await checkServer(server, respond(401))).up).toBe(true);
    const down = await checkServer(server, respond(502));
    expect(down).toMatchObject({ up: false, detail: "Server error 502" });
  });

  it("reports a network failure and a timeout as down", async () => {
    const refused = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await checkServer(server, refused)).toMatchObject({ up: false, ms: null, detail: "Network request failed" });

    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await checkServer(server, hangs, 20)).toMatchObject({ up: false, detail: "No answer in 0.02s" });
  });

  it("finds servers that went down or came back", () => {
    const check = (id: string, up: boolean): ServerCheck => ({ id, up, ms: null, detail: "", checkedAt: "" });
    const changes = statusChanges([check("a", true), check("b", false), check("c", true)], [check("a", false), check("b", true), check("c", true), check("new", false)]);
    expect(changes.map((change) => [change.id, change.up])).toEqual([["a", false], ["b", true]]);
  });
});
