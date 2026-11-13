import { describe, expect, it, vi } from "vitest";
import { addDays, alternativeLabel, dayLabel, dayMuscles, defaultWeekdays, planApi, recoveryLine, setsBadge, setsChange, setsText, splitFor, todayOf, weekdayOf, type PlannedDay } from "@/lib/plan";

function day(overrides: Partial<PlannedDay> = {}): PlannedDay {
  return {
    id: "d1",
    date: "2026-11-15",
    kind: "push",
    status: "planned",
    workout_id: null,
    adjustment: "none",
    recovery_score: null,
    exercises: [],
    dropped: [],
    ...overrides
  };
}

const entry = (muscle: string, sets = 4, base = 4) => ({ id: muscle, exercise_id: null, name: muscle, slot: "x", muscle, position: 0, sets, base_sets: base, reps_low: 6, reps_high: 10, rest_seconds: 90, swapped_from: null, image_url: null, equipment: null });

describe("weekdays", () => {
  it("counts Monday as 0 like the server", () => {
    expect(weekdayOf(new Date(2026, 10, 16))).toBe(0); // a Monday
    expect(weekdayOf(new Date(2026, 10, 15))).toBe(6); // a Sunday
  });

  it("spreads the default days and keeps Friday off", () => {
    expect(defaultWeekdays(3)).toEqual([1, 3, 6]);
    for (let count = 1; count <= 6; count += 1) {
      expect(defaultWeekdays(count)).toHaveLength(count);
      expect(defaultWeekdays(count)).not.toContain(4);
    }
    expect(defaultWeekdays(0)).toEqual([6]);
  });
});

describe("splitFor", () => {
  it("matches the server's split for each number of days", () => {
    expect(splitFor(2, "advanced")).toEqual(["full_a", "full_b"]);
    expect(splitFor(3, "beginner")).toEqual(["full_a", "full_b"]);
    expect(splitFor(3, "intermediate")).toEqual(["push", "pull", "legs"]);
    expect(splitFor(4, "intermediate")).toEqual(["upper", "lower"]);
    expect(splitFor(5, "intermediate")).toHaveLength(5);
    expect(splitFor(7, "advanced")).toEqual(["push", "pull", "legs"]);
  });
});

describe("text", () => {
  it("writes sets and the rep range", () => {
    expect(setsText({ sets: 4, reps_low: 6, reps_high: 10 })).toBe("4 × 6–10");
    expect(setsText({ sets: 3, reps_low: 12, reps_high: 12 })).toBe("3 × 12");
  });

  it("puts the change in the badge", () => {
    expect(setsBadge({ sets: 3, base_sets: 4, reps_low: 6, reps_high: 10 })).toBe("3 × 6–10 (−1)");
    expect(setsBadge({ sets: 5, base_sets: 4, reps_low: 8, reps_high: 8 })).toBe("5 × 8 (+1)");
    expect(setsBadge({ sets: 4, base_sets: 4, reps_low: 6, reps_high: 10 })).toBe("4 × 6–10");
  });

  it("shows what recovery changed", () => {
    expect(setsChange({ sets: 3, base_sets: 4 })).toBe("−1");
    expect(setsChange({ sets: 5, base_sets: 4 })).toBe("+1");
    expect(setsChange({ sets: 4, base_sets: 4 })).toBeNull();
  });

  it("names a day's muscles once each", () => {
    expect(dayMuscles(day({ exercises: [entry("chest"), entry("shoulders"), entry("chest"), entry("triceps"), entry("abdominals")] }))).toBe("Chest · Shoulders · Triceps");
  });

  it("says today and tomorrow", () => {
    expect(dayLabel("2026-11-15", "2026-11-15")).toBe("Today");
    expect(dayLabel("2026-11-16", "2026-11-15")).toBe("Tomorrow");
    expect(dayLabel("2026-11-18", "2026-11-15")).toMatch(/18/);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("explains the recovery change", () => {
    expect(recoveryLine(day({ adjustment: "rest", recovery_score: 21.6 }))).toContain("22%");
    expect(recoveryLine(day({ adjustment: "light", recovery_score: 50 }))).toContain("one set fewer");
    expect(recoveryLine(day({ adjustment: "push", recovery_score: 90 }))).toContain("one set more");
    expect(recoveryLine(day())).toContain("No WHOOP recovery");
  });

  it("labels a swap option with its equipment", () => {
    expect(alternativeLabel({ id: "a", name: "Dumbbell Bench Press", equipment: "dumbbell", mechanic: "compound", level: "beginner", image_url: null, done_before: true })).toBe("Dumbbell Bench Press · Dumbbells · done before");
  });

  it("finds today's day", () => {
    const today = day({ id: "t", date: "2026-11-15" });
    expect(todayOf({ today: "2026-11-15", days: [today, day({ id: "n", date: "2026-11-16" })] })).toBe(today);
    expect(todayOf({ today: "2026-11-14", days: [today] })).toBeNull();
    expect(todayOf(null)).toBeNull();
  });
});

describe("planApi", () => {
  it("calls the server's paths", async () => {
    const api = { get: vi.fn().mockResolvedValue([]), post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue(undefined) };
    await planApi.week(api);
    await planApi.save(api, { goal: "muscle", level: "beginner", weekdays: [1, 3] });
    await planApi.start(api, day({ id: "d9", kind: "legs" }));
    await planApi.move(api, "d9");
    await planApi.swap(api, "e1", "Leg_Press");
    await planApi.sessionSwap(api, "w1", "Leg_Press");
    expect(api.get).toHaveBeenCalledWith("/plan/week");
    expect(api.put).toHaveBeenCalledWith("/plan", { goal: "muscle", level: "beginner", weekdays: [1, 3] });
    expect(api.post).toHaveBeenCalledWith("/plan/days/d9/start", { type: "Legs" });
    expect(api.post).toHaveBeenCalledWith("/plan/days/d9/move", {});
    expect(api.post).toHaveBeenCalledWith("/plan/exercises/e1/swap", { exercise_id: "Leg_Press" });
    expect(api.post).toHaveBeenCalledWith("/training/workout-exercises/w1/swap", { exercise_id: "Leg_Press" });
  });
});
