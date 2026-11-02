import { describe, expect, it, vi } from "vitest";
import {
  dayBounds,
  foodApi,
  foodFormInput,
  emptyFoodForm,
  isBarcode,
  logCandidate,
  macroText,
  mealsByType,
  mealTypeAt,
  parseAmount,
  plateItemNutrition,
  plateTotal,
  scaleNutrition,
  servingText,
  stepServings,
  targetPercent,
  type FoodCandidate,
  type PlateItem
} from "@/lib/food-log";
import type { Meal } from "@/lib/types";

// Made-up foods only.
const laban: FoodCandidate = {
  source: "off",
  source_id: "6281000000017",
  food_id: null,
  name: "Made-up Laban",
  brand: "Test Dairy",
  barcode: "6281000000017",
  serving_label: "200 ml",
  serving_grams: 200,
  calories: 120,
  protein_g: 6.2,
  carbs_g: 9.2,
  fat_g: 6.4
};

function fakeApi() {
  return {
    get: vi.fn(async (_path: string) => ({}) as never),
    post: vi.fn(async (path: string, _body?: unknown) => (path === "/food/remember" ? { id: "food-1" } : { id: "meal-1" }) as never),
    patch: vi.fn(),
    delete: vi.fn(async () => null)
  };
}

function meal(overrides: Partial<Meal>): Meal {
  return { id: "m", user_id: "u", name: "x", calories: 100, protein_g: null, carbs_g: null, fat_g: null, logged_at: "2026-11-02T09:00:00Z", created_at: "2026-11-02T09:00:00Z", ...overrides };
}

describe("food log", () => {
  it("asks for the local day, in Riyadh time", () => {
    expect(dayBounds(new Date("2026-11-02T01:30:00+03:00"))).toEqual({ start: "2026-11-01T21:00:00.000Z", end: "2026-11-02T21:00:00.000Z" });
  });

  it("guesses the meal from the time of day", () => {
    const at = (hour: number) => mealTypeAt(new Date(2026, 10, 2, hour));
    expect([at(7), at(13), at(17), at(20), at(1)]).toEqual(["breakfast", "lunch", "snack", "dinner", "snack"]);
  });

  it("scales a serving like the server rounds it", () => {
    expect(scaleNutrition(laban, 1.5)).toEqual({ calories: 180, protein_g: 9.3, carbs_g: 13.8, fat_g: 9.6 });
    expect(scaleNutrition({ calories: 33, protein_g: null, carbs_g: 1, fat_g: null }, 0.25)).toEqual({ calories: 8, protein_g: null, carbs_g: 0.3, fat_g: null });
  });

  it("steps servings by quarters under one and halves above", () => {
    expect(stepServings(1, 1)).toBe(1.5);
    expect(stepServings(1, -1)).toBe(0.75);
    expect(stepServings(0.25, -1)).toBe(0.25);
    expect(stepServings(0.75, 1)).toBe(1);
    expect(stepServings(50, 1)).toBe(50);
  });

  it("describes servings and macros briefly", () => {
    expect(servingText(laban)).toBe("200 ml · 200 g");
    expect(servingText({ serving_label: "100 g", serving_grams: 100 })).toBe("100 g");
    expect(servingText({ serving_label: "1 plate", serving_grams: null })).toBe("1 plate");
    expect(macroText(laban)).toBe("P 6.2 · C 9.2 · F 6.4");
    expect(macroText({ protein_g: null, carbs_g: 37.5, fat_g: null })).toBe("C 37.5");
  });

  it("caps the calorie ring at the target", () => {
    expect(targetPercent(1100, 2200)).toBe(50);
    expect(targetPercent(3000, 2200)).toBe(100);
    expect(targetPercent(500, null)).toBe(0);
  });

  it("groups the day's meals in meal order", () => {
    const groups = mealsByType([meal({ id: "a", meal_type: "dinner", calories: 700 }), meal({ id: "b", meal_type: "breakfast", calories: 300 }), meal({ id: "c" }), meal({ id: "d", meal_type: "dinner", calories: 50 })]);
    expect(groups.map((group) => [group.type, group.meals.map((m) => m.id), group.calories])).toEqual([
      ["breakfast", ["b"], 300],
      ["dinner", ["a", "d"], 750],
      ["other", ["c"], 100]
    ]);
  });

  it("reads number fields, Arabic digits included", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("٧٢٠")).toBe(720);
    expect(parseAmount("-3")).toBeUndefined();
    expect(parseAmount("abc")).toBeUndefined();
  });

  it("checks the my-food form", () => {
    expect(foodFormInput(emptyFoodForm)).toEqual({ error: "Give the food a name." });
    expect(foodFormInput({ ...emptyFoodForm, name: "Home kabsa" })).toEqual({ error: "Enter the calories for one serving." });
    expect(foodFormInput({ ...emptyFoodForm, name: "Home kabsa", calories: "720", protein_g: "x" })).toEqual({ error: "Check protein." });
    expect(foodFormInput({ ...emptyFoodForm, name: " Home kabsa ", serving_label: "1 plate", serving_grams: "450", calories: "720", fat_g: "24" })).toEqual({
      input: { name: "Home kabsa", serving_label: "1 plate", serving_grams: 450, calories: 720, protein_g: null, carbs_g: null, fat_g: 24, barcode: null }
    });
    expect(foodFormInput({ ...emptyFoodForm, name: "Dates", calories: "20" }))
      .toMatchObject({ input: { serving_label: "1 serving", serving_grams: null } });
  });

  it("cleans the plate estimate before logging", () => {
    const item: PlateItem = { name: "Chicken kabsa rice", portion: "1.5 cups", grams: 300, calories: 519.6, protein_g: 9.04, carbs_g: -1, fat_g: null, confidence: "medium" };
    expect(plateItemNutrition(item)).toEqual({ calories: 520, protein_g: 9, carbs_g: null, fat_g: null });
    expect(plateTotal([item, { ...item, calories: 80 }])).toBe(600);
  });

  it("knows a food barcode", () => {
    expect(isBarcode("6281000000017")).toBe(true);
    expect(isBarcode("12ab")).toBe(false);
    expect(isBarcode("12345")).toBe(false);
  });

  it("saves an outside result before logging it, and reuses a saved one", async () => {
    const api = fakeApi();
    const at = new Date("2026-11-02T09:00:00Z");
    await logCandidate(api, laban, 2, "breakfast", at);
    expect(api.post.mock.calls[0][0]).toBe("/food/remember");
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("food_id");
    expect(api.post.mock.calls[1]).toEqual(["/foods/food-1/log", { servings: 2, meal_type: "breakfast", logged_at: "2026-11-02T09:00:00.000Z" }]);

    api.post.mockClear();
    await logCandidate(api, { ...laban, food_id: "food-9" }, 1, "snack", at);
    expect(api.post.mock.calls.map((call) => call[0])).toEqual(["/foods/food-9/log"]);
  });

  it("builds the server paths", async () => {
    const api = fakeApi();
    await foodApi.search(api, " laban ");
    await foodApi.barcode(api, "6281000000017");
    await foodApi.photo(api, "abc", "image/jpeg", "  ");
    expect(api.get.mock.calls.map((call) => call[0])).toEqual(["/food/search?q=laban", "/food/barcode/6281000000017"]);
    expect(api.post.mock.calls[0]).toEqual(["/food/photo", { image: "abc", media_type: "image/jpeg", note: null }]);
  });
});
