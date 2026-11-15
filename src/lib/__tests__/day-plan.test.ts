import { describe, expect, it } from "vitest";
import { blockTitle, dayPlanBody, dayPlanCacheKey, dayPlanCacheValue, energyLine, hhmm, isNow, parseDayPlanCache, upcomingBlocks, type DayBlock, type DayPlan } from "@/lib/day-plan";

const block = (start: string, end: string, kind: DayBlock["kind"], extra: Partial<DayBlock> = {}): DayBlock => ({ start, end, kind, title: "", task_id: null, prayer: null, priority: null, workout_kind: null, ...extra });
const plan: DayPlan = {
  date: "2026-11-06",
  start: "07:15",
  energy: { level: "high", recovery: 82, sleep_hours: 7.5 },
  rest_day: false,
  note: null,
  source: "rules",
  left_out: 0,
  blocks: [block("07:15", "08:15", "task", { title: "Write the report", task_id: "t1" }), block("11:40", "12:00", "prayer", { prayer: "dhuhr" }), block("16:00", "17:00", "workout", { workout_kind: "push" }), block("17:10", "17:30", "prayer", { prayer: "maghrib" })]
};

describe("day plan", () => {
  it("sends the day, the clock and only today's prayers as local HH:MM", () => {
    const now = new Date(2026, 10, 6, 7, 5);
    const prayers = [
      { name: "dhuhr" as const, label: "الظهر", at: new Date(2026, 10, 6, 11, 40) },
      { name: "fajr" as const, label: "الفجر", at: new Date(2026, 10, 7, 4, 51) }
    ];
    expect(dayPlanBody(prayers, now, "ar")).toEqual({ date: "2026-11-06", locale: "ar", now: "07:05", prayers: [{ name: "dhuhr", at: "11:40" }] });
    expect(hhmm(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
  });

  it("shows what is running now and what comes next", () => {
    expect(upcomingBlocks(plan, new Date(2026, 10, 6, 7, 30), 2).map((b) => b.start)).toEqual(["07:15", "11:40"]);
    expect(upcomingBlocks(plan, new Date(2026, 10, 6, 12, 0), 4).map((b) => b.start)).toEqual(["16:00", "17:10"]);
    expect(upcomingBlocks(plan, new Date(2026, 10, 6, 21, 0), 4)).toEqual([]);
    expect(isNow(plan.blocks[0], new Date(2026, 10, 6, 8, 14))).toBe(true);
    expect(isNow(plan.blocks[0], new Date(2026, 10, 6, 8, 15))).toBe(false);
  });

  it("names prayers, workouts and breaks in the app's language", () => {
    expect(blockTitle(plan.blocks[0])).toBe("Write the report");
    expect(blockTitle(plan.blocks[1])).toBe("Dhuhr prayer");
    expect(blockTitle(plan.blocks[2])).toBe("Workout: Push");
    expect(blockTitle(block("09:00", "09:15", "break"))).toBe("Short break");
    expect(blockTitle(block("09:00", "09:15", "break", { title: "Coffee" }))).toBe("Coffee");
  });

  it("describes the energy, or nothing without WHOOP", () => {
    expect(energyLine(plan.energy)).toBe("High energy · Recovery 82% · Sleep 7.5 h");
    expect(energyLine({ level: null, recovery: null, sleep_hours: 6 })).toBe("Sleep 6 h");
    expect(energyLine(null)).toBeNull();
  });

  it("keeps a saved AI plan only for the same day, language and AI", () => {
    const raw = dayPlanCacheValue("2026-11-06", "en", "openai", plan);
    expect(parseDayPlanCache(raw, "2026-11-06", "en", "openai")).toEqual(plan);
    expect(parseDayPlanCache(raw, "2026-11-07", "en", "openai")).toBeNull();
    expect(parseDayPlanCache(raw, "2026-11-06", "ar", "openai")).toBeNull();
    expect(parseDayPlanCache(raw, "2026-11-06", "en", "anthropic")).toBeNull();
    expect(parseDayPlanCache("not json", "2026-11-06", "en", "openai")).toBeNull();
    expect(parseDayPlanCache(JSON.stringify({ date: "2026-11-06", locale: "en", provider: "openai", plan: { ...plan, blocks: [{}] } }), "2026-11-06", "en", "openai")).toBeNull();
    expect(dayPlanCacheKey("u1")).toBe("orbit.cache.dayplan.u1");
  });
});
