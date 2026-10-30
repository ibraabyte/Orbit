import { describe, expect, it, vi } from "vitest";
import { contactedUpdate, markPersonContacted } from "@/lib/people-actions";

const now = new Date("2026-07-01T12:00:00.000Z");

describe("people actions", () => {
  it("builds date-only contacted updates", () => {
    expect(contactedUpdate(30, now)).toEqual({
      last_contacted_at: "2026-07-01",
      next_follow_up_at: "2026-07-31"
    });
    expect(contactedUpdate(null, now)).toEqual({
      last_contacted_at: "2026-07-01",
      next_follow_up_at: null
    });
  });


  it("sends the contacted update for one person to the server", async () => {
    const api = { patch: vi.fn(async () => null) };
    await expect(markPersonContacted(api as never, "person-1", 7, now)).resolves.toEqual({
      last_contacted_at: "2026-07-01",
      next_follow_up_at: "2026-07-08"
    });
    expect(api.patch).toHaveBeenCalledWith("/people/person-1", { last_contacted_at: "2026-07-01", next_follow_up_at: "2026-07-08" });
  });

  it("passes server errors on", async () => {
    const api = { patch: vi.fn(async () => Promise.reject(new Error("update failed"))) };
    await expect(markPersonContacted(api as never, "person-1", 30, now)).rejects.toThrow("update failed");
  });
});
