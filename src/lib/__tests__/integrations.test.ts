import { describe, expect, it } from "vitest";
import { adminApi, aiFormReady, aiState, integrationsApi, seerrState, whoopState } from "@/lib/integrations";

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

  it("says whose AI writes the summaries", () => {
    const none = { connected: false, provider: null, model: null, instructions: null, connected_at: null };
    expect(aiState({ ...none, configured: false })).toMatchObject({ label: "Not connected", tone: "neutral" });
    expect(aiState({ ...none, configured: true }).label).toBe("Server key");
    expect(aiState({ ...none, configured: true, connected: true, provider: "gemini", model: "made-up-model" })).toMatchObject({ label: "Connected", tone: "success", detail: "Gemini · made-up-model" });
  });

  it("sends the saved key only when a new one was typed", async () => {
    const { api, calls } = fakeApi();
    await integrationsApi.connectAi(api, { provider: "openai", model: " m ", apiKey: " key-123 ", instructions: " focus on sleep " });
    await integrationsApi.connectAi(api, { provider: "openai", model: "m", apiKey: "  ", instructions: "" });
    await integrationsApi.disconnectAi(api);
    expect(calls).toEqual([
      { method: "PUT", path: "/integrations/ai", body: { provider: "openai", model: "m", api_key: "key-123", instructions: "focus on sleep" } },
      { method: "PUT", path: "/integrations/ai", body: { provider: "openai", model: "m", instructions: "" } },
      { method: "DELETE", path: "/integrations/ai", body: undefined }
    ]);
  });

  it("asks for what each provider needs before saving", () => {
    const form = { provider: "openai" as const, model: "m", apiKey: "key-123" };
    expect(aiFormReady(form, null)).toBe(true);
    expect(aiFormReady({ ...form, model: " " }, null)).toBe(false);
    expect(aiFormReady({ ...form, provider: "anthropic", model: "" }, null)).toBe(true);
    expect(aiFormReady({ ...form, apiKey: "" }, null)).toBe(false);
    // The saved key only stands in for its own provider.
    expect(aiFormReady({ ...form, apiKey: "" }, "openai")).toBe(true);
    expect(aiFormReady({ ...form, apiKey: "" }, "gemini")).toBe(false);
  });
});
