import { describe, expect, it } from "vitest";
import {
  exerciseSearchPath,
  exercisesApi,
  exerciseSubtitle,
  GYM_EQUIPMENT,
  hiddenNote,
  INJURY_AREAS,
  injuryNote,
  label,
  orderedGym,
  sortInjuries,
  toggleItem,
  type Injury
} from "@/lib/exercises";

function injury(overrides: Partial<Injury>): Injury {
  return { id: "i1", user_id: "u1", area: "knee", note: null, active: true, started_on: null, ended_on: null, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", ...overrides };
}

function fakeApi() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return null as never;
  };
  return { api: { get: record("GET"), post: record("POST"), put: record("PUT"), patch: record("PATCH"), delete: record("DELETE") }, calls };
}

describe("exercises", () => {
  it("builds the search path with only the filters that are set", () => {
    expect(exerciseSearchPath()).toBe("/exercises?limit=40");
    expect(exerciseSearchPath({ q: "  bench press ", muscle: "chest", onlyMyGym: true, offset: 40 })).toBe("/exercises?q=bench+press&muscle=chest&only_my_gym=true&limit=40&offset=40");
    expect(exerciseSearchPath({ q: " ", equipment: "body only", includeInjured: true, onlyMyGym: false })).toBe("/exercises?equipment=body+only&include_injured=true&limit=40");
  });

  it("matches the server's lists of areas and equipment", () => {
    // Same as INJURY_AREAS and GYM_EQUIPMENT in backend/app/models/fitness.py.
    expect(INJURY_AREAS).toHaveLength(24);
    expect(INJURY_AREAS.slice(0, 9)).toEqual(["neck", "shoulder", "elbow", "wrist", "upper back", "lower back", "hip", "knee", "ankle"]);
    expect(new Set(INJURY_AREAS).size).toBe(INJURY_AREAS.length);
    expect(GYM_EQUIPMENT).not.toContain("body only");
  });

  it("sends the right calls for gym and injuries", async () => {
    const { api, calls } = fakeApi();
    await exercisesApi.setGym(api, ["dumbbell", "cable"]);
    await exercisesApi.addInjury(api, "lower back", "  ", "2026-11-02");
    await exercisesApi.heal(api, injury({ id: "a" }), "2026-11-02");
    // Healing can't end before it started (a start date typed in the future).
    await exercisesApi.heal(api, injury({ id: "b", started_on: "2026-11-05" }), "2026-11-02");
    await exercisesApi.reopen(api, injury({ id: "c", active: false, ended_on: "2026-11-01" }));
    await exercisesApi.detail(api, "Barbell_Squat");
    expect(calls).toEqual([
      { method: "PUT", path: "/gym/equipment", body: { equipment: ["dumbbell", "cable"] } },
      { method: "POST", path: "/injuries", body: { area: "lower back", note: null, started_on: "2026-11-02" } },
      { method: "PATCH", path: "/injuries/a", body: { active: false, ended_on: "2026-11-02" } },
      { method: "PATCH", path: "/injuries/b", body: { active: false, ended_on: "2026-11-05" } },
      { method: "PATCH", path: "/injuries/c", body: { active: true, ended_on: null } },
      { method: "GET", path: "/exercises/Barbell_Squat", body: undefined }
    ]);
  });

  it("lists active injuries first, newest first", () => {
    const sorted = sortInjuries([
      injury({ id: "old-healed", active: false, created_at: "2026-09-01T00:00:00Z" }),
      injury({ id: "old-active", created_at: "2026-09-02T00:00:00Z" }),
      injury({ id: "new-active", created_at: "2026-10-02T00:00:00Z" }),
      injury({ id: "new-healed", active: false, created_at: "2026-10-03T00:00:00Z" })
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["new-active", "old-active", "new-healed", "old-healed"]);
  });

  it("toggles gym items and keeps the list in a fixed order", () => {
    expect(toggleItem(["cable"], "barbell")).toEqual(["cable", "barbell"]);
    expect(toggleItem(["cable", "barbell"], "cable")).toEqual(["barbell"]);
    expect(orderedGym(["machine", "barbell", "cable"])).toEqual(["barbell", "cable", "machine"]);
  });

  it("explains injuries and hidden results in plain words", () => {
    expect(injuryNote({ avoid: ["knee"], caution: ["lower back"] })).toEqual({ tone: "urgent", text: "Works your injured knee" });
    expect(injuryNote({ avoid: [], caution: ["lower back", "wrist"] })).toEqual({ tone: "accent", text: "Also loads your lower back, wrist. Go light." });
    expect(injuryNote({ avoid: [], caution: [] })).toBeNull();
    expect(hiddenNote({ hidden_by_gym: 0, hidden_by_injuries: 0 })).toBeNull();
    expect(hiddenNote({ hidden_by_gym: 40, hidden_by_injuries: 12 })).toBe("12 hidden for your injuries · 40 need equipment your gym doesn't have");
  });

  it("names equipment and muscles for people", () => {
    expect(label(null)).toBe("Bodyweight");
    expect(label("quadriceps")).toBe("Quads");
    expect(label("something new")).toBe("Something new");
    expect(exerciseSubtitle({ equipment: "barbell", primary_muscles: ["quadriceps", "glutes"] })).toBe("Barbell · Quads · Glutes");
  });
});
