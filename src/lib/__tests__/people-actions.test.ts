import { describe, expect, it } from "vitest";
import { contactedUpdate, markPersonContacted, type PeopleActionClient } from "@/lib/people-actions";

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

  it("marks a person contacted with owner filters", async () => {
    const { supabase, state } = fakeSupabase();

    await expect(markPersonContacted("user-1", "person-1", 7, now, supabase)).resolves.toEqual({
      last_contacted_at: "2026-07-01",
      next_follow_up_at: "2026-07-08"
    });

    expect(state.table).toBe("people");
    expect(state.update).toEqual({
      last_contacted_at: "2026-07-01",
      next_follow_up_at: "2026-07-08"
    });
    expect(state.filters).toEqual([
      ["id", "person-1"],
      ["user_id", "user-1"]
    ]);
  });

  it("surfaces update errors", async () => {
    const { supabase } = fakeSupabase("update failed");

    await expect(markPersonContacted("user-1", "person-1", 30, now, supabase)).rejects.toThrow("update failed");
  });
});

function fakeSupabase(message: string | null = null) {
  const state = {
    table: "",
    update: {} as Record<string, unknown>,
    filters: [] as Array<[string, string]>
  };

  const supabase = {
    from(table: string) {
      state.table = table;
      return {
        update(payload: Record<string, unknown>) {
          state.update = payload;
          return updateChain(state.filters, message);
        }
      };
    }
  };

  return { supabase: supabase as unknown as PeopleActionClient, state };
}

function updateChain(filters: Array<[string, string]>, message: string | null) {
  const chain = {
    eq(field: string, value: string) {
      filters.push([field, value]);
      return chain;
    },
    then(resolve: (value: { data: null; error: { message: string } | null }) => void) {
      resolve({ data: null, error: message ? { message } : null });
    }
  };
  return chain;
}
