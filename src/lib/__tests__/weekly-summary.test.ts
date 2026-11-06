import { describe, expect, it } from "vitest";
import { isFriday, parseWeekCache, spendChange, weekCacheKey, weekCacheValue, weekEnd, type WeekFacts, type WeekReply } from "@/lib/weekly-summary";

// The test zone is Asia/Riyadh. 6 Nov 2026 is a Friday.
const facts: WeekFacts = {
  start: "2026-10-31", end: "2026-11-06", tasks_done: 4, tasks_overdue: 1, tasks_next_week: 3, workouts: 2, workout_minutes: 75, workout_target: 150,
  recovery_avg: 61.5, sleep_hours_avg: 7.1, calories_avg: 2100, calorie_target: 2200,
  spent: [{ currency: "SAR", total: 120 }], spent_last_week: [{ currency: "SAR", total: 100 }], bills_next_week: 1, saved: 2
};
const reply: WeekReply = { facts, summary: "A steady week.", plan: ["Clear the overdue task."] };

describe("which week", () => {
  it("ends today on a Friday, else on the Friday before", () => {
    expect(isFriday(new Date(2026, 10, 6, 8))).toBe(true);
    expect(weekEnd(new Date(2026, 10, 6, 8))).toBe("2026-11-06");
    expect(weekEnd(new Date(2026, 10, 6, 23, 59))).toBe("2026-11-06");
    expect(weekEnd(new Date(2026, 10, 7, 0, 5))).toBe("2026-11-06");
    expect(weekEnd(new Date(2026, 10, 12, 12))).toBe("2026-11-06");
    expect(weekEnd(new Date(2026, 10, 13, 12))).toBe("2026-11-13");
    expect(isFriday(new Date(2026, 10, 12, 12))).toBe(false);
  });

  it("crosses a month and a year", () => {
    expect(weekEnd(new Date(2027, 0, 1, 9))).toBe("2027-01-01");
    expect(weekEnd(new Date(2026, 11, 31, 9))).toBe("2026-12-25");
  });
});

describe("saved summary", () => {
  const raw = weekCacheValue("2026-11-06", "ar", "Claude", reply);

  it("is per user and only for the same week, language and AI", () => {
    expect(weekCacheKey("u1")).toBe("orbit.cache.week.u1");
    expect(parseWeekCache(raw, "2026-11-06", "ar", "Claude")).toEqual(reply);
    expect(parseWeekCache(raw, "2026-11-13", "ar", "Claude")).toBeNull();
    expect(parseWeekCache(raw, "2026-11-06", "en", "Claude")).toBeNull();
    expect(parseWeekCache(raw, "2026-11-06", "ar", "OpenAI")).toBeNull();
  });

  it("treats anything broken or half-written as nothing saved", () => {
    expect(parseWeekCache(null, "2026-11-06", "ar", "Claude")).toBeNull();
    expect(parseWeekCache("{", "2026-11-06", "ar", "Claude")).toBeNull();
    const bad = (part: object) => JSON.stringify({ end: "2026-11-06", locale: "ar", provider: "Claude", reply: { ...reply, ...part } });
    expect(parseWeekCache(bad({ summary: "" }), "2026-11-06", "ar", "Claude")).toBeNull();
    expect(parseWeekCache(bad({ plan: [5] }), "2026-11-06", "ar", "Claude")).toBeNull();
    expect(parseWeekCache(bad({ facts: { ...facts, end: "2026-10-30" } }), "2026-11-06", "ar", "Claude")).toBeNull();
    expect(parseWeekCache(bad({ facts: { ...facts, spent: [{ currency: "SAR" }] } }), "2026-11-06", "ar", "Claude")).toBeNull();
  });
});

describe("spending against last week", () => {
  it("is a whole percent, or nothing without last week", () => {
    expect(spendChange(facts, "SAR")).toBe(20);
    expect(spendChange({ ...facts, spent: [{ currency: "SAR", total: 50 }] }, "SAR")).toBe(-50);
    expect(spendChange({ ...facts, spent_last_week: [] }, "SAR")).toBeNull();
    expect(spendChange(facts, "USD")).toBeNull();
  });
});
