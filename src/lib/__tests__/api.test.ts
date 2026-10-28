import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, errorMessage, type TokenStorage } from "@/lib/api";

function memoryStorage(initial: string | null = null): TokenStorage & { value: string | null } {
  return {
    value: initial,
    async get() {
      return this.value;
    },
    async set(token) {
      this.value = token;
    },
    async remove() {
      this.value = null;
    }
  };
}

function json(status: number, body: unknown) {
  return new Response(body === undefined ? "" : JSON.stringify(body), { status });
}

const tokens = (n: number) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 900, user_id: "user-1" });
const saved = (n: number) => JSON.stringify({ refreshToken: `refresh-${n}`, userId: "user-1" });

// A fake server: refresh token n becomes n + 1, and access tokens older than `validFrom` are expired.
function fakeServer() {
  let issued = 1;
  let validFrom = 1;
  const calls: { method: string; path: string; auth?: string; body?: unknown }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("https://api.test", "");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", path, auth: headers.Authorization, body });

    if (path === "/auth/sign-in") return body.password === "right" ? json(200, tokens(issued)) : json(401, { detail: "Wrong email or password." });
    if (path === "/auth/refresh") {
      if (body.refresh_token !== `refresh-${issued}`) return json(401, { detail: "Session expired. Sign in again." });
      issued += 1;
      return json(200, tokens(issued));
    }
    if (path === "/auth/sign-out") return json(204, undefined);
    const access = Number(headers.Authorization?.replace("Bearer access-", ""));
    if (!access || access < validFrom) return json(401, { detail: "Not signed in." });
    return json(200, { ok: true, path });
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    expireAccess: () => {
      validFrom = issued + 1;
    }
  };
}

describe("api client", () => {
  it("signs in, saves the refresh token, and sends the access token", async () => {
    const server = fakeServer();
    const storage = memoryStorage();
    const api = createApiClient({ baseUrl: "https://api.test/", storage, fetch: server.fetch, device: "ios" });
    const seen: unknown[] = [];
    api.onSessionChange((session) => seen.push(session));

    await expect(api.signIn(" me@example.com ", "right")).resolves.toEqual({ userId: "user-1" });
    expect(server.calls[0].body).toEqual({ email: "me@example.com", password: "right", device: "ios" });
    expect(storage.value).toBe(saved(1));
    expect(seen).toEqual([{ userId: "user-1" }]);

    await expect(api.get("/dashboard")).resolves.toEqual({ ok: true, path: "/dashboard" });
    expect(server.calls.at(-1)?.auth).toBe("Bearer access-1");
  });

  it("shows the server's reason when sign-in fails", async () => {
    const api = createApiClient({ baseUrl: "https://api.test", storage: memoryStorage(), fetch: fakeServer().fetch });
    await expect(api.signIn("me@example.com", "wrong")).rejects.toThrow("Wrong email or password.");
    expect(api.session).toBeNull();
  });

  it("refreshes once for many requests that hit an expired token", async () => {
    const server = fakeServer();
    const storage = memoryStorage();
    const api = createApiClient({ baseUrl: "https://api.test", storage, fetch: server.fetch });
    await api.signIn("me@example.com", "right");
    server.expireAccess();

    const results = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(results.map((r) => (r as { path: string }).path)).toEqual(["/a", "/b", "/c"]);
    // Parallel refreshes with one token would look like theft to the server.
    expect(server.calls.filter((call) => call.path === "/auth/refresh")).toHaveLength(1);
    expect(storage.value).toBe(saved(2));
  });

  it("restores a saved session at start, even before the server answers", async () => {
    const server = fakeServer();
    const api = createApiClient({ baseUrl: "https://api.test", storage: memoryStorage(saved(1)), fetch: server.fetch });
    await expect(api.restore()).resolves.toEqual({ userId: "user-1" });
    await expect(api.get("/dashboard")).resolves.toMatchObject({ ok: true });
  });

  it("stays signed in offline, so the cached dashboard can show", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const storage = memoryStorage(saved(1));
    const api = createApiClient({ baseUrl: "https://api.test", storage, fetch: offline });

    await expect(api.restore()).resolves.toEqual({ userId: "user-1" });
    await expect(api.get("/dashboard")).rejects.toThrow("Can't reach the Orbit server");
    expect(storage.value).toBe(saved(1));
  });

  it("signs out when the server refuses the saved session", async () => {
    const storage = memoryStorage(JSON.stringify({ refreshToken: "stolen", userId: "user-1" }));
    const api = createApiClient({ baseUrl: "https://api.test", storage, fetch: fakeServer().fetch });
    const seen: unknown[] = [];
    api.onSessionChange((session) => seen.push(session));

    await expect(api.restore()).resolves.toBeNull();
    expect(storage.value).toBeNull();
    expect(seen).toEqual([{ userId: "user-1" }, null]);
    await expect(api.get("/dashboard")).rejects.toMatchObject({ status: 401 });
  });

  it("signs out locally first, then tells the server", async () => {
    const server = fakeServer();
    const storage = memoryStorage();
    const api = createApiClient({ baseUrl: "https://api.test", storage, fetch: server.fetch });
    await api.signIn("me@example.com", "right");

    await api.signOut();
    expect(api.session).toBeNull();
    expect(storage.value).toBeNull();
    expect(server.calls.at(-1)).toMatchObject({ path: "/auth/sign-out", body: { refresh_token: "refresh-1" } });
  });

  it("reads FastAPI error bodies", () => {
    expect(errorMessage(409, { detail: "That already exists." })).toBe("That already exists.");
    expect(errorMessage(422, { detail: [{ msg: "String should have at least 1 character" }, { msg: "Field required" }] })).toBe(
      "String should have at least 1 character\nField required"
    );
    expect(errorMessage(502, null)).toBe("The server had a problem. Try again.");
    expect(errorMessage(404, "<html>")).toBe("Request failed (404).");
    expect(new ApiError(404, "Task not found.")).toMatchObject({ status: 404, message: "Task not found." });
  });
});
