import { describe, expect, it } from "vitest";
import { parseQuickAdd, validateQuickAddDraft } from "@/lib/quick-add";

describe("quick add parser", () => {
  it("parses task commands with priority, date, and tags", () => {
    expect(parseQuickAdd("task: Book dentist !high @2026-07-05T10:00 repeat monthly #admin")).toMatchObject({
      kind: "task",
      title: "Book dentist",
      priority: "high",
      recurrence: "monthly",
      tags: ["admin"]
    });
    expect(parseQuickAdd("task: Clean apartment every week")).toMatchObject({
      kind: "task",
      title: "Clean apartment",
      recurrence: "weekly"
    });
  });

  it("parses natural due and reminder tokens", () => {
    const now = new Date(2026, 6, 1, 10, 0);

    expect(parseQuickAdd("task: Book dentist !high @tomorrow ~tomorrow-09:00 #admin", { now })).toMatchObject({
      kind: "task",
      title: "Book dentist",
      priority: "high",
      recurrence: null,
      at: new Date(2026, 6, 2, 12, 0).toISOString(),
      reminderAt: new Date(2026, 6, 2, 9, 0).toISOString(),
      tags: ["admin"]
    });

    expect(parseQuickAdd("focus: Weekly review 30min @friday-14:30", { now })).toMatchObject({
      kind: "focus",
      title: "Weekly review",
      at: new Date(2026, 6, 3, 14, 30).toISOString()
    });
  });

  it("parses conversational date and reminder phrases", () => {
    const now = new Date(2026, 6, 1, 10, 0);

    expect(parseQuickAdd("task: Book dentist @tomorrow 9am ~in 2 hours", { now })).toMatchObject({
      kind: "task",
      title: "Book dentist",
      at: new Date(2026, 6, 2, 9, 0).toISOString(),
      reminderAt: new Date(2026, 6, 1, 12, 0).toISOString()
    });

    expect(parseQuickAdd("person: Call Sara @next week", { now })).toMatchObject({
      kind: "person",
      title: "Call Sara",
      at: new Date(2026, 6, 8, 12, 0).toISOString()
    });

    expect(parseQuickAdd("focus: Planning 45min @next monday at 2:30pm", { now })).toMatchObject({
      kind: "focus",
      title: "Planning",
      at: new Date(2026, 6, 6, 14, 30).toISOString()
    });
  });

  it("parses capture links", () => {
    expect(parseQuickAdd("capture: https://example.com Read later #research")).toMatchObject({
      kind: "capture",
      title: "Read later",
      url: "https://example.com",
      captureType: "link",
      tags: ["research"]
    });
  });

  it("parses health commands", () => {
    expect(parseQuickAdd("meal: Chicken bowl 650cal 45p 62c 18f #protein")).toMatchObject({
      kind: "meal",
      title: "Chicken bowl",
      calories: 650,
      proteinG: 45,
      carbsG: 62,
      fatG: 18
    });
    expect(parseQuickAdd("workout: Push day 45min")).toMatchObject({
      kind: "workout",
      title: "Push day",
      durationMinutes: 45
    });
    expect(parseQuickAdd("weight: 82kg")).toMatchObject({
      kind: "weight",
      weight: 82,
      unit: "kg"
    });
    expect(parseQuickAdd("weight: 180 @2026-07-05", { defaultWeightUnit: "lb" })).toMatchObject({
      kind: "weight",
      weight: 180,
      unit: "lb"
    });
    expect(parseQuickAdd("sleep: 7.5h quality 4 #recovery")).toMatchObject({
      kind: "sleep",
      title: "Sleep log",
      sleepMinutes: 450,
      sleepQuality: 4,
      tags: ["recovery"]
    });
  });

  it("parses food planning commands", () => {
    expect(parseQuickAdd("mealplan: Salmon bowl 720cal protein 48g carbs 55g fat 24g dinner @2026-07-03 #prep")).toMatchObject({
      kind: "mealPlan",
      title: "Salmon bowl",
      calories: 720,
      proteinG: 48,
      carbsG: 55,
      fatG: 24,
      mealType: "dinner",
      tags: ["prep"]
    });
    expect(parseQuickAdd("grocery: 2 tubs Greek yogurt dairy @2026-07-03 #prep")).toMatchObject({
      kind: "grocery",
      title: "Greek yogurt",
      groceryQuantity: "2 tubs",
      groceryCategory: "dairy",
      tags: ["prep"]
    });
    expect(parseQuickAdd("grocery: Eggs qty 12 dairy")).toMatchObject({
      kind: "grocery",
      title: "Eggs",
      groceryQuantity: "12",
      groceryCategory: "dairy"
    });
    expect(parseQuickAdd("grocery: Rice 1kg pantry")).toMatchObject({
      kind: "grocery",
      title: "Rice",
      groceryQuantity: "1kg",
      groceryCategory: "pantry"
    });
    expect(parseQuickAdd("grocery: Apples x4 produce")).toMatchObject({
      kind: "grocery",
      title: "Apples",
      groceryQuantity: "4",
      groceryCategory: "produce"
    });
  });

  it("parses people commands", () => {
    expect(parseQuickAdd("person: Sara favorite @2026-07-12 #family")).toMatchObject({
      kind: "person",
      title: "Sara",
      personRelationship: "family",
      favorite: true,
      tags: ["family"]
    });
    expect(parseQuickAdd("person: Sara relationship close friend via WhatsApp birthday 1996-07-12 favorite @next week #family")).toMatchObject({
      kind: "person",
      title: "Sara",
      personRelationship: "close friend",
      contactMethod: "WhatsApp",
      birthday: "1996-07-12",
      favorite: true,
      tags: ["family"]
    });
  });

  it("parses finance commands", () => {
    expect(parseQuickAdd("expense: Coffee 4.50 USD #food")).toMatchObject({
      kind: "expense",
      title: "Coffee",
      amount: 4.5,
      currency: "USD",
      financeCategory: "food"
    });
    expect(parseQuickAdd("bill: Internet 65 USD monthly autopay @2026-07-10 #home")).toMatchObject({
      kind: "bill",
      title: "Internet",
      amount: 65,
      currency: "USD",
      financeCategory: "home",
      billRecurrence: "monthly",
      billAutopay: true
    });
    expect(parseQuickAdd("bill: Rent 1200 USD monthly no autopay")).toMatchObject({
      kind: "bill",
      title: "Rent",
      billAutopay: false
    });
  });

  it("parses focus commands", () => {
    expect(parseQuickAdd("focus: Deep work 50min energy 4 #work")).toMatchObject({
      kind: "focus",
      title: "Deep work",
      durationMinutes: 50,
      focusEnergy: 4,
      tags: ["work"]
    });
  });

  it("parses habit, goal, and journal commands", () => {
    expect(parseQuickAdd("habit: Walk weekly")).toMatchObject({ kind: "habit", title: "Walk", frequency: "weekly", recurrence: null });
    expect(parseQuickAdd("goal: Cut to 80kg @2026-09-01")).toMatchObject({ kind: "goal", title: "Cut to 80kg" });
    expect(parseQuickAdd("journal: good Strong focus today")).toMatchObject({
      kind: "journal",
      title: "Strong focus today",
      mood: "good"
    });
  });

  it("validates incomplete commands before saving", () => {
    expect(validateQuickAddDraft(parseQuickAdd("weight: morning"))).toMatchObject({
      ok: false,
      message: "Weight commands need a value like 82kg or 180lb."
    });
    expect(validateQuickAddDraft(parseQuickAdd("sleep: rough night"))).toMatchObject({
      ok: false,
      message: "Sleep commands need a duration like 7.5h or 450min."
    });
    expect(validateQuickAddDraft(parseQuickAdd("focus: Inbox cleanup"))).toMatchObject({
      ok: false,
      message: "Focus commands need a duration like 50min."
    });
    expect(validateQuickAddDraft(parseQuickAdd("expense: Coffee"))).toMatchObject({
      ok: false,
      message: "Expense commands need an amount like 4.50 USD."
    });
    expect(validateQuickAddDraft(parseQuickAdd("bill: Internet"))).toMatchObject({
      ok: false,
      message: "Bill commands need an amount like 65 USD."
    });
  });

  it("validates unresolved date markers", () => {
    const taskInput = "task: Call Sara @someday";
    const reminderInput = "reminder: Take vitamins ~later";

    expect(validateQuickAddDraft(parseQuickAdd(taskInput), taskInput)).toMatchObject({
      ok: false,
      message: "Due date was not recognized. Try @tomorrow 9am or @2026-07-05."
    });
    expect(validateQuickAddDraft(parseQuickAdd(reminderInput), reminderInput)).toMatchObject({
      ok: false,
      message: "Reminder time was not recognized. Try ~in 2 hours or ~tomorrow at 8am."
    });
    expect(validateQuickAddDraft(parseQuickAdd("task: Call Sara @tomorrow 9am"), "task: Call Sara @tomorrow 9am")).toMatchObject({
      ok: true,
      message: null
    });
  });
});
