import { describe, expect, it } from "vitest";
import { deltaText, goalsBody, goalsChanged, goalsForm, weightHistory, whoopWeekMinutes } from "@/lib/health-hub";
import type { WeightLog } from "@/lib/types";

const weight = (id: string, value: number, at: string, unit: "kg" | "lb" = "kg"): WeightLog => ({ id, user_id: "user-1", weight: value, unit, logged_at: at, created_at: at });

describe("goals form", () => {
  it("shows unset goals as empty boxes and keeps the workout default", () => {
    expect(goalsForm(null)).toEqual({ daily_calorie_target: "", daily_protein_target: "", daily_carbs_target: "", daily_fat_target: "", weekly_workout_minutes_target: "150" });
    expect(goalsForm({ daily_calorie_target: 2200, daily_protein_target: 140, weekly_workout_minutes_target: 200 }).daily_calorie_target).toBe("2200");
  });

  it("turns boxes into the profile body, empty means no goal", () => {
    const form = { ...goalsForm(null), daily_calorie_target: "2200", daily_protein_target: " 140 " };
    expect(goalsBody(form)).toEqual({ body: { daily_calorie_target: 2200, daily_protein_target: 140, daily_carbs_target: null, daily_fat_target: null, weekly_workout_minutes_target: 150 } });
  });

  it("reads Arabic digits", () => {
    const form = { ...goalsForm(null), daily_calorie_target: "٢٢٠٠" };
    expect(goalsBody(form)).toMatchObject({ body: { daily_calorie_target: 2200 } });
  });

  it("refuses words, decimals, numbers past the server's limit, and an empty workout goal", () => {
    expect(goalsBody({ ...goalsForm(null), daily_protein_target: "lots" })).toHaveProperty("error");
    expect(goalsBody({ ...goalsForm(null), daily_fat_target: "60.5" })).toHaveProperty("error");
    expect(goalsBody({ ...goalsForm(null), daily_calorie_target: "20001" })).toHaveProperty("error");
    expect(goalsBody({ ...goalsForm(null), weekly_workout_minutes_target: "" })).toHaveProperty("error");
  });

  it("knows when something changed", () => {
    const profile = { daily_calorie_target: 2200, daily_protein_target: null, daily_carbs_target: null, daily_fat_target: null, weekly_workout_minutes_target: 150 };
    expect(goalsChanged(goalsForm(profile), profile)).toBe(false);
    expect(goalsChanged({ ...goalsForm(profile), daily_protein_target: "120" }, profile)).toBe(true);
  });
});

describe("weight history", () => {
  it("lists newest first with the change from the weigh-in before", () => {
    const history = weightHistory([weight("a", 82, "2026-07-01T07:00:00Z"), weight("b", 81.6, "2026-07-08T07:00:00Z"), weight("c", 81.9, "2026-07-04T07:00:00Z")]);
    expect(history.map((row) => [row.log.id, row.delta])).toEqual([
      ["b", -0.3],
      ["c", -0.1],
      ["a", null]
    ]);
  });

  it("does not compare kilograms with pounds", () => {
    const history = weightHistory([weight("a", 180, "2026-07-01T07:00:00Z", "lb"), weight("b", 82, "2026-07-08T07:00:00Z")]);
    expect(history[0].delta).toBeNull();
  });

  it("writes the change with an arrow", () => {
    expect(deltaText(-0.4)).toBe("↓0.4");
    expect(deltaText(1.2)).toBe("↑1.2");
    expect(deltaText(0)).toBeNull();
    expect(deltaText(null)).toBeNull();
  });
});

describe("WHOOP workout minutes", () => {
  it("adds the last 7 days, today included", () => {
    const now = new Date("2026-07-10T12:00:00+03:00");
    const daily = [
      { date: "2026-07-03", workout_minutes: 99 },
      { date: "2026-07-04", workout_minutes: 30 },
      { date: "2026-07-10", workout_minutes: 45 }
    ];
    expect(whoopWeekMinutes(daily, now)).toBe(75);
  });
});
