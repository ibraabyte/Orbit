// Food tracking on the server: saved foods, search, barcode, the day's log and the plate photo estimate.
// Plain TypeScript so it can be tested without React Native.

import type { ApiClient } from "@/lib/api";
import type { Meal } from "@/lib/types";

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";
export const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack", "other"];

export type Nutrition = {
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type FoodSource = "custom" | "off" | "usda" | "ai";

export type SavedFood = Nutrition & {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  source: FoodSource;
  source_id: string | null;
  barcode: string | null;
  serving_label: string;
  serving_grams: number | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FoodCandidate = Nutrition & {
  source: FoodSource;
  source_id: string | null;
  food_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  serving_label: string;
  serving_grams: number | null;
};

export type FoodInput = Nutrition & {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  serving_label: string;
  serving_grams?: number | null;
};

export type FoodDay = {
  meals: Meal[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  targets: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
};

export type PlateItem = Nutrition & {
  name: string;
  portion: string;
  grams: number | null;
  confidence: "low" | "medium" | "high";
};

export type PlateEstimate = { items: PlateItem[]; note: string; model: string };

export const foodApi = {
  day: (api: Api, date = new Date()) => {
    const { start, end } = dayBounds(date);
    return api.get<FoodDay>(`/food/day?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  },
  recent: (api: Api) => api.get<SavedFood[]>("/food/recent"),
  mine: (api: Api) => api.get<SavedFood[]>("/foods?limit=200"),
  search: (api: Api, query: string) => api.get<{ results: FoodCandidate[]; notes: string[] }>(`/food/search?q=${encodeURIComponent(query.trim())}`),
  barcode: (api: Api, code: string) => api.get<FoodCandidate>(`/food/barcode/${encodeURIComponent(code)}`),
  create: (api: Api, food: FoodInput) => api.post<SavedFood>("/foods", food),
  remember: (api: Api, candidate: FoodCandidate) => api.post<SavedFood>("/food/remember", rememberBody(candidate)),
  remove: (api: Api, foodId: string) => api.delete(`/foods/${foodId}`),
  log: (api: Api, foodId: string, servings: number, mealType: MealType, at = new Date()) =>
    api.post<Meal>(`/foods/${foodId}/log`, { servings, meal_type: mealType, logged_at: at.toISOString() }),
  logPlateItem: (api: Api, item: PlateItem, mealType: MealType, at = new Date()) =>
    api.post<Meal>("/meals", { ...plateItemNutrition(item), name: item.name.trim() || "Food", meal_type: mealType, logged_at: at.toISOString() }),
  deleteMeal: (api: Api, mealId: string) => api.delete(`/meals/${mealId}`),
  photo: (api: Api, image: string, mediaType: "image/jpeg" | "image/png" | "image/webp", note?: string) =>
    api.post<PlateEstimate>("/food/photo", { image, media_type: mediaType, note: note?.trim() || null })
};

/** Logs a search, barcode or saved result: reuses the saved copy, or saves an outside result first. */
export async function logCandidate(api: Api, candidate: FoodCandidate, servings: number, mealType: MealType, at = new Date()) {
  let foodId = candidate.food_id;
  if (!foodId) {
    if (candidate.source !== "off" && candidate.source !== "usda") throw new Error("This food isn't saved yet.");
    foodId = (await foodApi.remember(api, candidate)).id;
  }
  return foodApi.log(api, foodId, servings, mealType, at);
}

export function rememberBody(candidate: FoodCandidate) {
  const { food_id: _ignored, ...rest } = candidate;
  return rest;
}

export function savedToCandidate(food: SavedFood): FoodCandidate {
  return {
    source: food.source,
    source_id: food.source_id,
    food_id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    serving_label: food.serving_label,
    serving_grams: food.serving_grams,
    calories: food.calories,
    protein_g: food.protein_g,
    carbs_g: food.carbs_g,
    fat_g: food.fat_g
  };
}

/** The local calendar day around `date`, as instants the server can compare. */
export function dayBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** A sensible default for the meal picker from the time of day. */
export function mealTypeAt(date = new Date()): MealType {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 18 && hour < 23) return "dinner";
  return "snack";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** What `servings` of a food comes to, matching how the server rounds. */
export function scaleNutrition(food: Nutrition, servings: number): Nutrition {
  const times = (value: number | null) => (value === null ? null : round1(value * servings));
  return { calories: Math.round(food.calories * servings), protein_g: times(food.protein_g), carbs_g: times(food.carbs_g), fat_g: times(food.fat_g) };
}

export function plateItemNutrition(item: PlateItem): Nutrition {
  const clean = (value: number | null) => (value === null || !Number.isFinite(value) || value < 0 ? null : round1(value));
  return { calories: Math.max(0, Math.round(item.calories || 0)), protein_g: clean(item.protein_g), carbs_g: clean(item.carbs_g), fat_g: clean(item.fat_g) };
}

export function plateTotal(items: PlateItem[]) {
  return items.reduce((sum, item) => sum + plateItemNutrition(item).calories, 0);
}

export function servingText(food: Pick<FoodCandidate, "serving_label" | "serving_grams">) {
  const grams = food.serving_grams ? `${formatNumber(food.serving_grams)} g` : null;
  return grams && !food.serving_label.includes(grams) && food.serving_label !== grams ? `${food.serving_label} · ${grams}` : food.serving_label;
}

export function macroText(food: Pick<Nutrition, "protein_g" | "carbs_g" | "fat_g">) {
  return [food.protein_g !== null ? `P ${formatNumber(food.protein_g)}` : null, food.carbs_g !== null ? `C ${formatNumber(food.carbs_g)}` : null, food.fat_g !== null ? `F ${formatNumber(food.fat_g)}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function sourceLabel(source: FoodSource) {
  return { custom: "Mine", off: "Open Food Facts", usda: "USDA", ai: "AI" }[source];
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(round1(value));
}

/** Steps for the servings control: quarters below 1, halves after. */
export function stepServings(current: number, direction: 1 | -1) {
  const step = current < 1 || (current === 1 && direction === -1) ? 0.25 : 0.5;
  return Math.min(50, Math.max(0.25, Math.round((current + direction * step) * 100) / 100));
}

/** Calories against the profile's target, for the ring: 0 to 100. */
export function targetPercent(value: number, target: number | null | undefined) {
  if (!target) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)));
}

export function mealsByType(meals: Meal[]) {
  const groups = new Map<MealType, Meal[]>();
  for (const meal of meals) {
    const type = (meal.meal_type ?? "other") as MealType;
    groups.set(type, [...(groups.get(type) ?? []), meal]);
  }
  return mealTypes.filter((type) => groups.has(type)).map((type) => ({ type, meals: groups.get(type)!, calories: groups.get(type)!.reduce((sum, meal) => sum + meal.calories, 0) }));
}

/** Parses a number field; empty is null, anything else that isn't a non-negative number is undefined (invalid). */
export function parseAmount(text: string): number | null | undefined {
  const cleaned = text.trim().replace(",", ".").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export type FoodForm = { name: string; serving_label: string; serving_grams: string; calories: string; protein_g: string; carbs_g: string; fat_g: string; barcode?: string };

/** Checks the "my food" form. Returns the body to send, or the first problem in words. */
export function foodFormInput(form: FoodForm): { input: FoodInput } | { error: string } {
  const name = form.name.trim();
  if (!name) return { error: "Give the food a name." };
  const calories = parseAmount(form.calories);
  if (calories === null || calories === undefined) return { error: "Enter the calories for one serving." };
  const fields = { serving_grams: parseAmount(form.serving_grams), protein_g: parseAmount(form.protein_g), carbs_g: parseAmount(form.carbs_g), fat_g: parseAmount(form.fat_g) };
  for (const [key, value] of Object.entries(fields)) if (value === undefined) return { error: `Check ${key.replace("_g", "").replace("serving_grams", "grams")}.` };
  if (fields.serving_grams === 0) return { error: "Grams per serving must be more than 0." };
  return {
    input: {
      name,
      serving_label: form.serving_label.trim() || "1 serving",
      serving_grams: fields.serving_grams ?? null,
      calories,
      protein_g: fields.protein_g ?? null,
      carbs_g: fields.carbs_g ?? null,
      fat_g: fields.fat_g ?? null,
      barcode: form.barcode?.trim() || null
    }
  };
}

export const emptyFoodForm: FoodForm = { name: "", serving_label: "", serving_grams: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" };

export function isBarcode(code: string) {
  return /^\d{6,14}$/.test(code);
}
