import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/readiness/server/route";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn()
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient
}));

const originalEnv = { ...process.env };

describe("/api/readiness/server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns setup diagnostics without auth when Supabase is not configured", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toContainEqual(
      expect.objectContaining({
        id: "server-supabase",
        state: "blocked"
      })
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests once Supabase is configured", async () => {
    configureSupabaseEnv();

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid bearer tokens", async () => {
    configureSupabaseEnv();
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });

    const response = await GET(request("bad-token"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mocks.createClient).toHaveBeenCalledWith("https://orbit.supabase.co", "anon-key", {
      auth: {
        persistSession: false
      }
    });
    expect(mocks.getUser).toHaveBeenCalledWith("bad-token");
  });

  it("returns server readiness for valid signed-in users without exposing secrets", async () => {
    configureSupabaseEnv({
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-vapid",
      VAPID_PRIVATE_KEY: "private-vapid",
      VAPID_SUBJECT: "mailto:ops@orbit.app",
      CRON_SECRET: "orbit-cron-secret-for-production-tests"
    });
    mocks.createClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const response = await GET(request("valid-token"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.items).toContainEqual(
      expect.objectContaining({
        id: "server-cron",
        state: "ready"
      })
    );
    expect(serialized).not.toContain("service-role-secret");
    expect(serialized).not.toContain("private-vapid");
    expect(serialized).not.toContain("orbit-cron-secret-for-production-tests");
  });
});

function request(token?: string) {
  return new Request("https://orbit.test/api/readiness/server", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined
  }) as never;
}

function configureSupabaseEnv(overrides: Record<string, string> = {}) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://orbit.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  Object.assign(process.env, overrides);
}
