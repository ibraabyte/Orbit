import { describe, expect, it } from "vitest";
import { ACT_HISTORY_TURNS, ACT_TEXT_MAX, ACT_TURN_MAX, actBody, actionRequest, actionRows, applyActions, editableField, instantDraft, kindName, mealTotal, opName, withEdit, type ProposedAction } from "@/lib/assistant";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const action = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({ op: "create", kind: "expense", id: null, label: "Lunch", fields: { merchant: "Lunch", amount: 45 }, ...overrides });

describe("applying what the person confirmed", () => {
  it("sends each change to that item's own route", () => {
    expect(actionRequest(action())).toEqual({ method: "POST", path: "/expenses", body: { merchant: "Lunch", amount: 45 } });
    expect(actionRequest(action({ op: "update", kind: "task", id: ID, fields: { due_at: "2026-11-06T09:00:00+03:00" } }))).toEqual({
      method: "PATCH",
      path: `/tasks/${ID}`,
      body: { due_at: "2026-11-06T09:00:00+03:00" }
    });
    expect(actionRequest(action({ op: "delete", kind: "grocery", id: ID, fields: {} }))).toEqual({ method: "DELETE", path: `/grocery-items/${ID}` });
    expect(actionRequest(action({ op: "complete", kind: "task", id: ID, fields: {} }))).toEqual({ method: "POST", path: `/tasks/${ID}/complete` });
  });

  it("refuses anything it can't place safely", () => {
    expect(actionRequest(action({ kind: "journal" }))).toBeNull();
    expect(actionRequest(action({ id: ID }))).toBeNull(); // a create never targets a row
    expect(actionRequest(action({ op: "update", id: "../admin/settings" }))).toBeNull();
    expect(actionRequest(action({ op: "update", id: ID, fields: {} }))).toBeNull();
    expect(actionRequest(action({ op: "complete", kind: "expense", id: ID }))).toBeNull();
  });

  it("keeps going after a failure and says which one failed", async () => {
    const calls: string[] = [];
    const api = {
      post: async (path: string) => {
        calls.push(`POST ${path}`);
        if (path === "/reminders") throw new Error("remind_at is required");
        return null as never;
      },
      patch: async (path: string) => {
        calls.push(`PATCH ${path}`);
        return null as never;
      },
      delete: async (path: string) => {
        calls.push(`DELETE ${path}`);
        return null;
      }
    };
    const result = await applyActions(api, [action({ kind: "reminder" }), action(), action({ kind: "nope" }), action({ op: "delete", id: ID })]);
    expect(calls).toEqual(["POST /reminders", "POST /expenses", `DELETE /expenses/${ID}`]);
    expect(result.done).toBe(2);
    expect(result.failed.map((item) => [item.action.kind, item.message])).toEqual([
      ["reminder", "remind_at is required"],
      ["nope", "Not a change Orbit can make."]
    ]);
  });
});

describe("what skips the AI", () => {
  const opts = { defaultCurrency: "SAR", now: new Date("2026-11-05T12:00:00+03:00") };

  it("saves plain quick-add lines at once", () => {
    expect(instantDraft("غداء 45", opts)?.draft).toMatchObject({ kind: "expense", amount: 45 });
    expect(instantDraft("spent 25 lunch", opts)?.draft).toMatchObject({ kind: "expense", amount: 25 });
  });

  it("sends anything else to the assistant", () => {
    expect(instantDraft("", opts)).toBeNull();
    expect(instantDraft("خل مهمة السباك بكرة واحذف تذكير الإيجار", opts)).toBeNull();
    expect(instantDraft("call mom 3", opts)).toBeNull();
    // A guessed kind that falls back to a task is a guess, so the assistant decides.
    expect(instantDraft("غداء", opts)).toBeNull();
  });

  it("sends food with no calories said to the assistant, so it is estimated instead of saved as 0", () => {
    expect(instantDraft("أكلت كبسة دجاج وبيبسي", opts)).toBeNull();
    expect(instantDraft("ate a shawarma", opts)).toBeNull();
    expect(instantDraft("أكلت سلطة 300 سعرة", opts)?.draft).toMatchObject({ kind: "meal", calories: 300 });
  });
});

describe("what goes to the server", () => {
  it("keeps the request and the follow-up history short", () => {
    const history = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? ("assistant" as const) : ("user" as const), content: "x".repeat(ACT_TURN_MAX + 10) }));
    const body = actBody(`  ${"y".repeat(ACT_TEXT_MAX + 5)}  `, history, "ar");
    expect(body.text).toHaveLength(ACT_TEXT_MAX);
    expect(body.history).toHaveLength(ACT_HISTORY_TURNS);
    expect(body.history.every((turn) => turn.content.length === ACT_TURN_MAX)).toBe(true);
    expect(body.locale).toBe("ar");
  });
});

describe("what the person checks", () => {
  it("names each change and shows the fields that would be sent, without ids", () => {
    expect(`${opName("create", true)} · ${kindName("expense", true)}`).toBe("إضافة · مصروف");
    expect(kindName("grocery", false)).toBe("Grocery");
    const rows = actionRows(action({ kind: "habit_log", fields: { habit_id: ID, note: "10 pages", amount: 1200, autopay: true, due_at: null } }), false);
    expect(rows).toEqual([
      ["Note", "10 pages"],
      ["Amount", "1,200"],
      ["Autopay", "✓"],
      ["Due", "—"]
    ]);
    expect(actionRows(action({ fields: { amount: 1200 } }), true)).toEqual([["المبلغ", "1,200"]]);
    // A task's list and checklist read as words; the list's id stays hidden.
    expect(actionRows(action({ kind: "task", fields: { title: "Pack", list_id: ID, list_name: "Travel", steps: ["Passport", "Charger"] } }), false)).toEqual([
      ["Title", "Pack"],
      ["List", "Travel"],
      ["Checklist", "Passport · Charger"]
    ]);
    expect(actionRequest(action({ kind: "task_list", fields: { name: "Work" } }))).toEqual({ method: "POST", path: "/task-lists", body: { name: "Work" } });
  });
});

describe("food told in words", () => {
  const FOOD = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
  const saved = action({ kind: "meal", label: "Home kabsa", fields: { name: "Home kabsa", food_id: FOOD, servings: 1.5, calories: 975, protein_g: 48, carbs_g: 120.8, meal_type: "lunch", logged_at: "2026-11-08T13:00:00+03:00" } });
  const guess = action({ kind: "meal", label: "Pepsi · 1 can", fields: { name: "Pepsi · 1 can", calories: 150, carbs_g: 41, protein_g: 0, logged_at: "2026-11-08T13:00:00+03:00" } });

  it("logs a saved food through its own route and an estimate as a plain meal", () => {
    expect(actionRequest(saved)).toEqual({ method: "POST", path: `/foods/${FOOD}/log`, body: { servings: 1.5, meal_type: "lunch", logged_at: "2026-11-08T13:00:00+03:00" } });
    expect(actionRequest(guess)).toEqual({ method: "POST", path: "/meals", body: guess.fields });
    expect(actionRequest(action({ kind: "meal", fields: { ...saved.fields, food_id: "../users" } }))).toBeNull();
    // The food's id is never shown.
    expect(actionRows(saved, false).map(([key]) => key)).not.toContain("food_id");
  });

  it("lets the person fix the number before confirming, with the rest following", () => {
    expect(editableField(saved)).toBe("servings");
    expect(editableField(guess)).toBe("calories");
    expect(editableField(action())).toBe("amount");
    expect(editableField(action({ op: "delete", id: ID }))).toBeNull();
    expect(withEdit(saved, 3).fields).toMatchObject({ servings: 3, calories: 1950, protein_g: 96, carbs_g: 241.6 });
    expect(withEdit(guess, 300).fields).toMatchObject({ calories: 300, carbs_g: 82, protein_g: 0 });
    expect(withEdit(action(), 60).fields.amount).toBe(60);
    expect(withEdit(guess, Number.NaN)).toBe(guess);
  });

  it("adds up the meals being confirmed", () => {
    expect(mealTotal([saved, guess, action()])).toEqual({ calories: 1125, protein_g: 48, carbs_g: 161.8, fat_g: 0 });
    expect(mealTotal([action()])).toBeNull();
  });
});

describe("a meal as the person reads it", () => {
  it("names the meal in their language and doesn't repeat the heading", () => {
    const meal = action({ kind: "meal", label: "Dates · 3", fields: { name: "Dates · 3", calories: 70, meal_type: "snack" } });
    expect(actionRows(meal, true)).toEqual([["السعرات", "70"], ["الوجبة", "سناك"]]);
    expect(actionRows(meal, false, "calories")).toEqual([["Meal", "Snack"]]);
  });
});

describe("the workout plan and the other new kinds", () => {
  it("sends the plan, a moved day and a planned exercise to their own routes", () => {
    const plan = { goal: "muscle", level: "intermediate", weekdays: [0, 2, 3, 6] };
    expect(actionRequest(action({ kind: "workout_plan", label: "Workout plan", fields: plan }))).toEqual({ method: "PUT", path: "/plan", body: plan });
    expect(actionRequest(action({ op: "update", kind: "workout_plan", fields: plan }))).toEqual({ method: "PUT", path: "/plan", body: plan });
    expect(actionRequest(action({ op: "delete", kind: "workout_plan", fields: {} }))).toEqual({ method: "DELETE", path: "/plan" });
    expect(actionRequest(action({ op: "move", kind: "planned_day", id: ID, fields: {} }))).toEqual({ method: "POST", path: `/plan/days/${ID}/move` });
    expect(actionRequest(action({ op: "update", kind: "planned_exercise", id: ID, fields: { sets: 5 } }))).toEqual({ method: "PATCH", path: `/plan/exercises/${ID}`, body: { sets: 5 } });
    expect(actionRequest(action({ kind: "medication", fields: { name: "Vitamin D", times: ["09:00"] } }))).toEqual({ method: "POST", path: "/medications", body: { name: "Vitamin D", times: ["09:00"] } });
    expect(actionRequest(action({ op: "delete", kind: "document", id: ID, fields: {} }))).toEqual({ method: "DELETE", path: `/documents/${ID}` });
  });

  it("refuses plan changes it can't place", () => {
    expect(actionRequest(action({ op: "update", kind: "planned_day", id: ID, fields: { kind: "push" } }))).toBeNull();
    expect(actionRequest(action({ op: "move", kind: "planned_day", id: "../plan", fields: {} }))).toBeNull();
    expect(actionRequest(action({ op: "move", kind: "task", id: ID, fields: {} }))).toBeNull();
    expect(actionRequest(action({ kind: "workout_plan", id: ID, fields: { goal: "muscle" } }))).toBeNull();
  });

  it("shows the plan's days and goal in words", () => {
    const plan = action({ kind: "workout_plan", label: "Workout plan", fields: { goal: "muscle", level: "beginner", weekdays: [6, 0] } });
    expect(actionRows(plan, true)).toEqual([["الهدف", "تضخيم"], ["المستوى", "مبتدئ"], ["الأيام", "الأحد، الاثنين"]]);
    const swap = action({ op: "update", kind: "planned_exercise", id: ID, label: "Bench", fields: { exercise_id: "Dumbbell_Bench_Press", planned_workout_id: ID } });
    expect(actionRows(swap, false)).toEqual([["Exercise", "Dumbbell Bench Press"]]);
    expect(kindName("workout_plan", true)).toBe("جدول التمارين");
    expect(opName("move", true)).toBe("تأجيل لبكرة");
  });
});
