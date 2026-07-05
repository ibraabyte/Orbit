import { localDateKey, lastDays, type DailyMetric } from "@/lib/insights";
import type { DashboardData, GroceryCategory, GroceryItem, MealPlan } from "@/lib/types";

export const groceryCategories: GroceryCategory[] = ["produce", "protein", "dairy", "pantry", "frozen", "household", "other"];

export type GroceryListEntry = {
  item: GroceryItem;
  mealPlan: MealPlan | null;
};

export type GroceryListSection = {
  category: GroceryCategory;
  items: GroceryListEntry[];
};

export type MealGroceryCoverage = {
  plan: MealPlan;
  groceries: GroceryItem[];
  hasGroceries: boolean;
};

export function formatMacros({
  protein,
  carbs,
  fat
}: {
  protein: number | null | undefined;
  carbs: number | null | undefined;
  fat: number | null | undefined;
}) {
  return [
    protein !== null && protein !== undefined ? `${protein}g protein` : null,
    carbs !== null && carbs !== undefined ? `${carbs}g carbs` : null,
    fat !== null && fat !== undefined ? `${fat}g fat` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

export function mealLogFromPlan(plan: MealPlan, loggedAt = new Date()) {
  return {
    user_id: plan.user_id,
    name: plan.name,
    calories: plan.calories,
    protein_g: plan.protein_g,
    carbs_g: plan.carbs_g,
    fat_g: plan.fat_g,
    logged_at: loggedAt.toISOString()
  };
}

export function mealPlansForDate(plans: MealPlan[], date: string) {
  return plans
    .filter((plan) => plan.plan_date === date && plan.status !== "skipped")
    .sort((a, b) => mealOrder(a.meal_type) - mealOrder(b.meal_type) || a.name.localeCompare(b.name));
}

export function upcomingMealPlans(plans: MealPlan[], days = 7, now = new Date()) {
  const today = localDateKey(now);
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const endKey = localDateKey(end);

  return plans
    .filter((plan) => plan.status !== "skipped" && plan.plan_date >= today && plan.plan_date <= endKey)
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date) || mealOrder(a.meal_type) - mealOrder(b.meal_type));
}

export function overdueMealPlans(plans: MealPlan[], now = new Date()) {
  const today = localDateKey(now);
  return plans
    .filter((plan) => plan.status === "planned" && plan.plan_date < today)
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date));
}

export function plannedCaloriesForDate(plans: MealPlan[], date: string) {
  return mealPlansForDate(plans, date).reduce((sum, plan) => sum + plan.calories, 0);
}

export function plannedCaloriesByDay(data: Pick<DashboardData, "mealPlans">, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: plannedCaloriesForDate(data.mealPlans, day.date)
  }));
}

export function neededGroceries(items: GroceryItem[]) {
  return items.filter((item) => item.status === "needed");
}

export function groceryItemsDue(items: GroceryItem[], days = 7, now = new Date()) {
  const today = localDateKey(now);
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const endKey = localDateKey(end);

  return neededGroceries(items)
    .filter((item) => !item.due_at || (item.due_at >= today && item.due_at <= endKey))
    .sort((a, b) => (a.due_at ?? "9999-12-31").localeCompare(b.due_at ?? "9999-12-31") || a.name.localeCompare(b.name));
}

export function groceryByCategory(items: GroceryItem[]) {
  const totals = new Map<GroceryCategory, number>();
  for (const item of neededGroceries(items)) {
    totals.set(item.category, (totals.get(item.category) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export function groceryListSections(items: GroceryItem[], plans: MealPlan[] = [], days = 7, now = new Date()): GroceryListSection[] {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const sections = new Map<GroceryCategory, GroceryListEntry[]>();

  for (const item of groceryItemsDue(items, days, now)) {
    const entries = sections.get(item.category) ?? [];
    entries.push({
      item,
      mealPlan: item.meal_plan_id ? (planById.get(item.meal_plan_id) ?? null) : null
    });
    sections.set(item.category, entries);
  }

  return groceryCategories
    .map((category) => ({
      category,
      items: sections.get(category) ?? []
    }))
    .filter((section) => section.items.length > 0);
}

export function mealGroceryCoverage(plans: MealPlan[], items: GroceryItem[], days = 7, now = new Date()): MealGroceryCoverage[] {
  const groceriesByPlan = new Map<string, GroceryItem[]>();

  for (const item of neededGroceries(items)) {
    if (!item.meal_plan_id) continue;
    const groceries = groceriesByPlan.get(item.meal_plan_id) ?? [];
    groceries.push(item);
    groceriesByPlan.set(item.meal_plan_id, groceries);
  }

  return upcomingMealPlans(plans, days, now)
    .filter((plan) => plan.status === "planned" || plan.status === "prepped")
    .map((plan) => {
      const groceries = [...(groceriesByPlan.get(plan.id) ?? [])].sort(sortGroceriesForMeal);
      return {
        plan,
        groceries,
        hasGroceries: groceries.length > 0
      };
    });
}

export function missingGroceryPlans(plans: MealPlan[], items: GroceryItem[], days = 7, now = new Date()) {
  return mealGroceryCoverage(plans, items, days, now)
    .filter((coverage) => coverage.plan.status === "planned" && !coverage.hasGroceries)
    .map((coverage) => coverage.plan);
}

export function foodSummary(data: Pick<DashboardData, "mealPlans" | "groceryItems">, now = new Date()) {
  const today = localDateKey(now);
  const todayPlans = mealPlansForDate(data.mealPlans, today);
  const upcoming = upcomingMealPlans(data.mealPlans, 7, now);
  const overduePlans = overdueMealPlans(data.mealPlans, now);
  const needed = neededGroceries(data.groceryItems);

  return {
    todayPlannedMeals: todayPlans.length,
    todayPlannedCalories: todayPlans.reduce((sum, plan) => sum + plan.calories, 0),
    upcomingMealPlans: upcoming,
    overdueMealPlans: overduePlans,
    neededGroceries: needed,
    dueGroceries: groceryItemsDue(data.groceryItems, 7, now),
    groceryCategories: groceryByCategory(data.groceryItems),
    grocerySections: groceryListSections(data.groceryItems, data.mealPlans, 7, now),
    mealGroceryCoverage: mealGroceryCoverage(data.mealPlans, data.groceryItems, 7, now),
    missingGroceryPlans: missingGroceryPlans(data.mealPlans, data.groceryItems, 7, now)
  };
}

export function mealTypeLabel(type: MealPlan["meal_type"]) {
  if (type === "other") return "Meal";
  return type[0].toUpperCase() + type.slice(1);
}

function mealOrder(type: MealPlan["meal_type"]) {
  return { breakfast: 0, lunch: 1, dinner: 2, snack: 3, other: 4 }[type];
}

function sortGroceriesForMeal(a: GroceryItem, b: GroceryItem) {
  return (a.due_at ?? "9999-12-31").localeCompare(b.due_at ?? "9999-12-31") || a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
}
