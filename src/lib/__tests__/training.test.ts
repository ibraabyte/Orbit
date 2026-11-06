import { describe, expect, it } from "vitest";
import {
  bodyTrends,
  changeText,
  clock,
  defaultUnit,
  elapsedSeconds,
  historyPath,
  kindHistory,
  MEASUREMENT_KINDS,
  newRecords,
  parseNumber,
  restLeft,
  restText,
  sessionLine,
  sessionTotals,
  setText,
  trainingApi,
  unitsFor,
  volumeText,
  type BodyMeasurement,
  type Bests,
  type SessionExercise,
  type WorkoutSet
} from "@/lib/training";
import type { WeightLog } from "@/lib/types";

function set(overrides: Partial<WorkoutSet>): WorkoutSet {
  return { id: "s1", user_id: "u1", workout_exercise_id: "e1", position: 0, reps: 8, weight: 60, unit: "kg", warmup: false, done: true, done_at: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...overrides };
}

function exercise(sets: WorkoutSet[]): SessionExercise {
  return { id: "e1", user_id: "u1", workout_id: "w1", exercise_id: "Barbell_Squat", name: "Barbell Squat", position: 0, rest_seconds: 90, note: null, created_at: "", updated_at: "", image_url: null, sets };
}

const best = (weight: number | null, reps: number, value: number, unit: "kg" | "lb" = "kg") => ({ workout_id: "w0", logged_at: "2026-10-01T10:00:00Z", weight, unit, reps, value });

function measurement(kind: BodyMeasurement["kind"], value: number, at: string, unit: BodyMeasurement["unit"] = "cm"): BodyMeasurement {
  return { id: `${kind}-${at}`, user_id: "u1", kind, value, unit, measured_at: at, note: null, created_at: at };
}

function weighIn(weight: number, at: string, unit: "kg" | "lb" = "kg"): WeightLog {
  return { id: `w-${at}`, user_id: "u1", weight, unit, logged_at: at, created_at: at };
}

function fakeApi() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return null as never;
  };
  return { api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), delete: record("DELETE") }, calls };
}

describe("training", () => {
  it("asks for history by catalogue id, or by name for a typed-in exercise", () => {
    expect(historyPath({ exercise_id: "Barbell_Squat", name: "Barbell Squat" }, "w1", 3)).toBe("/training/history?exercise_id=Barbell_Squat&exclude_workout=w1&limit=3");
    expect(historyPath({ exercise_id: null, name: "Sled push" })).toBe("/training/history?name=Sled+push&limit=10");
  });

  it("a new set copies the last one, at the next position", async () => {
    const { api, calls } = fakeApi();
    await trainingApi.addSet(api, exercise([set({ position: 2, weight: 70, reps: 6, unit: "lb" })]));
    await trainingApi.addSet(api, exercise([]));
    expect(calls[0]).toEqual({ method: "POST", path: "/workout-sets", body: { workout_exercise_id: "e1", position: 3, weight: 70, reps: 6, unit: "lb" } });
    expect(calls[1].body).toEqual({ workout_exercise_id: "e1", position: 0, weight: null, reps: null, unit: "kg" });
  });

  it("reads typed numbers, Arabic digits and commas too", () => {
    expect(parseNumber(" 62.5 ")).toBe(62.5);
    expect(parseNumber("٨٠")).toBe(80);
    expect(parseNumber("82,5")).toBe(82.5);
    expect(parseNumber("٧٢٫٥")).toBe(72.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("-3")).toBeNull();
  });

  it("writes sets and sessions short", () => {
    expect(setText({ weight: 60, unit: "kg", reps: 8 })).toBe("60 kg × 8");
    expect(setText({ weight: null, unit: "kg", reps: 12 })).toBe("× 12");
    expect(setText({ weight: 62.25, unit: "kg", reps: null })).toBe("62.3 kg");
    const same = [
      { weight: 60, unit: "kg" as const, reps: 8, warmup: false },
      { weight: 60, unit: "kg" as const, reps: 8, warmup: false }
    ];
    expect(sessionLine([{ weight: 40, unit: "kg", reps: 10, warmup: true }, ...same])).toBe("2 × 8 · 60 kg");
    expect(sessionLine([...same, { weight: 65, unit: "kg", reps: 6, warmup: false }])).toBe("60×8, 60×8, 65×6");
    expect(sessionLine([{ weight: null, unit: "kg", reps: 15, warmup: false }])).toBe("1 × 15");
    expect(sessionLine([])).toBe("");
  });

  it("shows clocks and rest", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(95)).toBe("1:35");
    expect(clock(3729)).toBe("1:02:09");
    expect(restText(0)).toBe("Off");
    expect(restText(45)).toBe("45 s");
    expect(restText(90)).toBe("1:30");
    const start = Date.parse("2026-11-06T18:00:00Z");
    expect(elapsedSeconds("2026-11-06T18:00:00Z", start + 61_500)).toBe(61);
    expect(elapsedSeconds("2026-11-06T18:00:00Z", start - 5000)).toBe(0);
    expect(restLeft(start + 30_000, start + 100)).toBe(30);
    expect(restLeft(start, start + 1)).toBe(0);
    expect(restLeft(null, start)).toBe(0);
  });

  it("spots a new best only when there is one to beat", () => {
    const bests: Bests = { heaviest: best(100, 2, 100), one_rep_max: best(100, 2, 106.7), most_reps: best(60, 15, 15), best_volume: null };
    expect(newRecords(set({ weight: 102.5, reps: 1 }), bests)).toEqual(["heaviest"]);
    // 95 × 5 → 110.8 estimated beats 106.7.
    expect(newRecords(set({ weight: 95, reps: 5 }), bests)).toEqual(["one_rep_max"]);
    expect(newRecords(set({ weight: 60, reps: 16 }), bests)).toEqual(["most_reps"]);
    // More reps with less weight is not a reps record.
    expect(newRecords(set({ weight: 40, reps: 20 }), bests)).toEqual([]);
    expect(newRecords(set({ weight: 120, reps: 1, warmup: true }), bests)).toEqual([]);
    expect(newRecords(set({ weight: 120, reps: 1, done: false }), bests)).toEqual([]);
    expect(newRecords(set({ weight: 120, reps: 1 }), null)).toEqual([]);
    expect(newRecords(set({ weight: 120, reps: 1 }), { heaviest: null, one_rep_max: null, most_reps: null, best_volume: null })).toEqual([]);
    // 225 lb is 102 kg.
    expect(newRecords(set({ weight: 225, unit: "lb", reps: 1 }), bests)).toEqual(["heaviest"]);
  });

  it("adds up a session", () => {
    const session = { exercises: [exercise([set({ weight: 100, reps: 5 }), set({ weight: 100, reps: 5, unit: "lb" }), set({ weight: 40, reps: 10, warmup: true }), set({ done: false })])] };
    // 500 + 100 lb × 5 (226.8 kg); warm-up and undone left out of the volume.
    expect(sessionTotals(session)).toEqual({ done: 3, total: 4, volumeKg: 727 });
    expect(volumeText(727)).toBe("727 kg");
    expect(volumeText(12_437)).toBe("12,440 kg");
  });

  it("starts in the unit of the latest weigh-in", () => {
    expect(defaultUnit([])).toBe("kg");
    expect(defaultUnit([{ unit: "lb" }, { unit: "kg" }])).toBe("lb");
  });

  it("builds a trend per measured kind, weight first", () => {
    const trends = bodyTrends(
      [measurement("waist", 86.5, "2026-10-01T08:00:00Z"), measurement("waist", 84, "2026-11-01T08:00:00Z"), measurement("waist", 85, "2026-10-15T08:00:00Z"), measurement("body_fat", 18, "2026-11-01T08:00:00Z", "%")],
      [weighIn(82, "2026-11-02T07:00:00Z"), weighIn(83.4, "2026-10-01T07:00:00Z")]
    );
    expect(trends.map((trend) => trend.kind)).toEqual(["weight", "waist", "body_fat"]);
    expect(trends[0]).toMatchObject({ latest: { value: 82, unit: "kg" }, change: -1.4, points: [83.4, 82], count: 2, firstAt: "2026-10-01T07:00:00Z" });
    expect(trends[1]).toMatchObject({ latest: { value: 84 }, change: -2.5, points: [86.5, 85, 84] });
    expect(trends[2]).toMatchObject({ change: null, points: [18] });
    expect(bodyTrends([], [])).toEqual([]);
  });

  it("compares only entries in the same unit", () => {
    const [arm] = bodyTrends([measurement("arm", 14, "2026-10-01T08:00:00Z", "in"), measurement("arm", 36, "2026-11-01T08:00:00Z"), measurement("arm", 37, "2026-11-05T08:00:00Z")], []);
    expect(arm).toMatchObject({ change: 1, points: [36, 37], count: 3 });
    expect(changeText(1, "cm")).toBe("+1 cm");
    expect(changeText(-2.45, "kg")).toBe("−2.5 kg");
    expect(changeText(0, "%")).toBe("±0 %");
    expect(changeText(null, "cm")).toBeNull();
  });

  it("lists one kind newest first", () => {
    const rows = kindHistory("weight", [], [weighIn(83, "2026-10-01T07:00:00Z"), weighIn(82, "2026-11-01T07:00:00Z")]);
    expect(rows.map((row) => row.value)).toEqual([82, 83]);
    expect(kindHistory("waist", [measurement("chest", 100, "2026-10-01T08:00:00Z")], [])).toEqual([]);
  });

  it("matches the server's measurement kinds and units", () => {
    // Same as MEASUREMENT_KINDS in backend/app/models/training.py.
    expect(MEASUREMENT_KINDS).toEqual(["waist", "chest", "hips", "arm", "thigh", "calf", "neck", "shoulders", "body_fat"]);
    expect(unitsFor("weight")).toEqual(["kg", "lb"]);
    expect(unitsFor("body_fat")).toEqual(["%"]);
    expect(unitsFor("waist")).toEqual(["cm", "in"]);
  });
});
