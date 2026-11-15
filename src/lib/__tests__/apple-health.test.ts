import { describe, expect, it } from "vitest";
import { hasData, latest, mergeSpans, sleepByDay, weekMinutes, workoutsByDay, type AppleHealthDay } from "@/lib/apple-health";

const at = (text: string) => new Date(text);
const day = (date: string, fields: Partial<AppleHealthDay> = {}): AppleHealthDay => ({
  date,
  steps: null,
  active_kcal: null,
  sleep_minutes: null,
  workouts: null,
  workout_minutes: null,
  resting_hr: null,
  average_hr: null,
  hrv_sdnn: null,
  weight_kg: null,
  ...fields
});

describe("Apple Health days", () => {
  it("counts sleep the Watch and another app both recorded once, on the morning you woke", () => {
    const watch = { start: at("2026-07-09T23:00:00"), end: at("2026-07-10T03:00:00") };
    const otherApp = { start: at("2026-07-10T02:00:00"), end: at("2026-07-10T06:30:00") };
    expect(mergeSpans([otherApp, watch])).toEqual([{ start: watch.start, end: otherApp.end }]);
    expect(sleepByDay([watch, otherApp])).toEqual(new Map([["2026-07-10", 450]]));
  });

  it("joins one workout recorded by two apps, keeps separate ones apart", () => {
    const run = { start: at("2026-07-10T07:00:00"), end: at("2026-07-10T07:40:00") };
    const sameRun = { start: at("2026-07-10T07:01:00"), end: at("2026-07-10T07:39:00") };
    const evening = { start: at("2026-07-10T18:00:00"), end: at("2026-07-10T18:30:00") };
    expect(workoutsByDay([run, sameRun, evening]).get("2026-07-10")).toEqual({ count: 2, minutes: 70 });
  });

  it("adds the last 7 days and counts a day WHOOP and Apple Health both have once", () => {
    const now = at("2026-07-10T12:00:00");
    const whoop = [
      { date: "2026-07-03", workout_minutes: 99 },
      { date: "2026-07-04", workout_minutes: 30 },
      { date: "2026-07-10", workout_minutes: 45 }
    ];
    expect(weekMinutes(whoop, [], now)).toBe(75);
    expect(weekMinutes(whoop, [day("2026-07-10", { workout_minutes: 50 }), day("2026-07-08", { workout_minutes: 20 })], now)).toBe(100);
  });

  it("skips empty days and finds the newest number", () => {
    expect(hasData(day("2026-07-10"))).toBe(false);
    expect(hasData(day("2026-07-10", { steps: 0 }))).toBe(true);
    expect(latest([day("2026-07-08", { weight_kg: 81 }), day("2026-07-09", { weight_kg: 80.4 }), day("2026-07-10")], "weight_kg")).toEqual({ value: 80.4, date: "2026-07-09" });
  });
});
