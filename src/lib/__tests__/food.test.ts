import { describe, expect, it } from "vitest";
import { foodSummary, formatMacros, groceryByCategory, groceryListSections, mealLogFromPlan, mealPlansForDate, missingGroceryPlans, plannedCaloriesByDay } from "@/lib/food";
import type { GroceryItem, MealPlan } from "@/lib/types";

const now = new Date("2026-07-10T12:00:00.000Z");

function mealPlan(overrides: Partial<MealPlan>): MealPlan {
  return {
    id: "meal-plan-1",
    user_id: "user-1",
    name: "Dinner",
    plan_date: "2026-07-10",
    meal_type: "dinner",
    calories: 700,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    note: null,
    status: "planned",
    created_at: "2026-07-10T08:00:00.000Z",
    updated_at: "2026-07-10T08:00:00.000Z",
    ...overrides
  };
}

function grocery(overrides: Partial<GroceryItem>): GroceryItem {
  return {
    id: "grocery-1",
    user_id: "user-1",
    meal_plan_id: null,
    name: "Rice",
    quantity: "1 bag",
    category: "pantry",
    status: "needed",
    due_at: "2026-07-10",
    created_at: "2026-07-10T08:00:00.000Z",
    updated_at: "2026-07-10T08:00:00.000Z",
    ...overrides
  };
}

describe("food planning", () => {
  it("formats macros only when values exist", () => {
    expect(formatMacros({ protein: 45, carbs: 62, fat: 18 })).toBe("45g protein · 62g carbs · 18g fat");
    expect(formatMacros({ protein: null, carbs: 40, fat: undefined })).toBe("40g carbs");
    expect(formatMacros({ protein: null, carbs: null, fat: null })).toBe("");
  });

  it("builds a meal log payload from a planned meal", () => {
    expect(
      mealLogFromPlan(
        mealPlan({
          name: "Salmon bowl",
          calories: 720,
          protein_g: 48,
          carbs_g: 55,
          fat_g: 24
        }),
        new Date("2026-07-10T18:30:00.000Z")
      )
    ).toEqual({
      user_id: "user-1",
      name: "Salmon bowl",
      calories: 720,
      protein_g: 48,
      carbs_g: 55,
      fat_g: 24,
      logged_at: "2026-07-10T18:30:00.000Z"
    });
  });

  it("orders planned meals and totals planned calories by day", () => {
    const mealPlans = [
      mealPlan({ id: "snack", name: "Yogurt", meal_type: "snack", calories: 180 }),
      mealPlan({ id: "breakfast", name: "Eggs", meal_type: "breakfast", calories: 320 }),
      mealPlan({ id: "skipped", name: "Skipped", status: "skipped", calories: 900 })
    ];

    expect(mealPlansForDate(mealPlans, "2026-07-10").map((plan) => plan.name)).toEqual(["Eggs", "Yogurt"]);
    expect(plannedCaloriesByDay({ mealPlans }, 1, now)).toEqual([{ date: "2026-07-10", label: "Fri", value: 500 }]);
  });

  it("summarizes needed groceries and overdue meal plans", () => {
    const data = {
      mealPlans: [
        mealPlan({ id: "today", calories: 700 }),
        mealPlan({ id: "old", plan_date: "2026-07-08", status: "planned" }),
        mealPlan({ id: "future", plan_date: "2026-07-12", status: "prepped" })
      ],
      groceryItems: [
        grocery({ id: "rice", category: "pantry" }),
        grocery({ id: "chicken", name: "Chicken", category: "protein" }),
        grocery({ id: "bought", status: "bought", category: "produce" })
      ]
    };

    expect(groceryByCategory(data.groceryItems)).toEqual([
      { category: "pantry", count: 1 },
      { category: "protein", count: 1 }
    ]);
    expect(foodSummary(data, now)).toMatchObject({
      todayPlannedMeals: 1,
      todayPlannedCalories: 700,
      overdueMealPlans: [{ id: "old" }],
      neededGroceries: [{ id: "rice" }, { id: "chicken" }]
    });
  });

  it("groups due groceries by category with meal context", () => {
    const mealPlans = [
      mealPlan({ id: "salmon", name: "Salmon dinner", plan_date: "2026-07-11", meal_type: "dinner" }),
      mealPlan({ id: "breakfast", name: "Yogurt breakfast", plan_date: "2026-07-12", meal_type: "breakfast" })
    ];
    const groceryItems = [
      grocery({ id: "salmon-fillet", name: "Salmon fillet", category: "protein", meal_plan_id: "salmon", due_at: "2026-07-10" }),
      grocery({ id: "berries", name: "Berries", category: "produce", meal_plan_id: "breakfast", due_at: "2026-07-11" }),
      grocery({ id: "detergent", name: "Detergent", category: "household", meal_plan_id: null, due_at: null }),
      grocery({ id: "far", name: "Pasta", category: "pantry", due_at: "2026-08-01" })
    ];

    const sections = groceryListSections(groceryItems, mealPlans, 7, now);

    expect(sections.map((section) => section.category)).toEqual(["produce", "protein", "household"]);
    expect(sections[0].items[0]).toMatchObject({
      item: { id: "berries" },
      mealPlan: { id: "breakfast" }
    });
    expect(sections[1].items[0]).toMatchObject({
      item: { id: "salmon-fillet" },
      mealPlan: { id: "salmon" }
    });
    expect(sections[2].items[0]).toMatchObject({
      item: { id: "detergent" },
      mealPlan: null
    });
  });

  it("finds planned meals without linked grocery coverage", () => {
    const mealPlans = [
      mealPlan({ id: "covered", name: "Covered lunch", plan_date: "2026-07-11", meal_type: "lunch" }),
      mealPlan({ id: "missing", name: "Missing dinner", plan_date: "2026-07-12", meal_type: "dinner" }),
      mealPlan({ id: "prepped", name: "Prepped breakfast", plan_date: "2026-07-12", meal_type: "breakfast", status: "prepped" }),
      mealPlan({ id: "later", name: "Later meal", plan_date: "2026-08-01", meal_type: "dinner" })
    ];
    const groceryItems = [
      grocery({ id: "covered-item", meal_plan_id: "covered", category: "protein" }),
      grocery({ id: "prepped-item", meal_plan_id: "prepped", category: "dairy" })
    ];

    expect(missingGroceryPlans(mealPlans, groceryItems, 7, now).map((plan) => plan.id)).toEqual(["missing"]);
    expect(foodSummary({ mealPlans, groceryItems }, now).missingGroceryPlans.map((plan) => plan.id)).toEqual(["missing"]);
  });
});
