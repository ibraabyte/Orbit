import { describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: {} }));

import { resolveSupabaseUrl } from "@/lib/supabase";

describe("resolveSupabaseUrl", () => {
  it("points a local URL at the Metro host", () => {
    expect(resolveSupabaseUrl("http://127.0.0.1:55321", "172.20.10.3:8081")).toBe("http://172.20.10.3:55321");
    expect(resolveSupabaseUrl("http://localhost:55321", "192.168.1.5:8081")).toBe("http://192.168.1.5:55321");
  });

  it("leaves hosted URLs and builds without a dev host alone", () => {
    expect(resolveSupabaseUrl("https://db.example.com", "172.20.10.3:8081")).toBe("https://db.example.com");
    expect(resolveSupabaseUrl("http://127.0.0.1:55321", undefined)).toBe("http://127.0.0.1:55321");
  });
});
