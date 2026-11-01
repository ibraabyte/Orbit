import { describe, expect, it } from "vitest";
import { adminApi, aiState, integrationsApi, seerrState, whoopState } from "@/lib/integrations";

function fakeApi() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return null as never;
  };
  return { api: { get: record("GET"), put: record("PUT"), patch: record("PATCH"), delete: record("DELETE") }, calls };
}

describe("integrations", () => {
  it("talks to the per-user routes", async () => {
    const { api, calls } = fakeApi();
    await integrationsApi.overview(api);
    await integrationsApi.connectSeerr(api, " https://seerr.example.com ", " key-123 ");
    await integrationsApi.disconnectSeerr(api);
    await adminApi.setSignupsOpen(api, true);
    expect(calls).toEqual([
      { method: "GET", path: "/integrations", body: undefined },
      { method: "PUT", path: "/integrations/seerr", body: { url: "https://seerr.example.com", api_key: "key-123" } },
      { method: "DELETE", path: "/integrations/seerr", body: undefined },
      { method: "PATCH", path: "/admin/settings", body: { signups_open: true } }
    ]);
  });

  it("describes WHOOP in words, not only color", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const base = { configured: true, connected: true, last_synced_at: "2026-11-01T11:30:00Z", last_sync_error: null };
    expect(whoopState({ ...base, configured: false }, now).label).toBe("Not available");
    expect(whoopState({ ...base, connected: false }, now)).toMatchObject({ label: "Not connected", tone: "neutral" });
    expect(whoopState({ ...base, last_sync_error: "WHOOP needs to be connected again." }, now)).toMatchObject({ label: "Needs attention", tone: "warning" });
    expect(whoopState(base, now)).toEqual({ label: "Connected", tone: "success", detail: "Synced 30m ago" });
  });

  it("shows which Seerr server and account", () => {
    expect(seerrState({ connected: false, url: null, account_name: null, connected_at: null }).label).toBe("Not connected");
    expect(seerrState({ connected: true, url: "https://seerr.example.com", account_name: "Test Viewer", connected_at: null }).detail).toBe("seerr.example.com as Test Viewer");
    expect(seerrState({ connected: true, url: "http://10.0.0.5:5055", account_name: null, connected_at: null }).detail).toBe("10.0.0.5:5055");
  });

  it("says whether the server provides AI summaries", () => {
    expect(aiState({ configured: true }).label).toBe("On");
    expect(aiState({ configured: false }).tone).toBe("neutral");
  });
});
