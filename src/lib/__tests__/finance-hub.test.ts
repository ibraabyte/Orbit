import { describe, expect, it } from "vitest";
import { budgetMonthTotal, cardsExpiring, isFoldOpen, readFolds, toggleFold } from "@/lib/finance-hub";
import type { Budget, Expense, PaymentCard } from "@/lib/types";

const now = new Date("2026-11-15T12:00:00");

const budget = (id: string, category: Budget["category"], amount: number, currency = "SAR", month = "2026-11-01"): Budget =>
  ({ id, user_id: "user-1", month, category, amount, currency, created_at: month, updated_at: month }) as Budget;

const expense = (id: string, category: Expense["category"], amount: number, at = "2026-11-10T12:00:00", currency = "SAR"): Expense =>
  ({ id, user_id: "user-1", merchant: "Test shop", category, amount, currency, spent_at: at, created_at: at }) as Expense;

const card = (id: string, expires_on: string | null): PaymentCard => ({ id, user_id: "user-1", name: "Test card", last4: "1234", expires_on }) as PaymentCard;

describe("folding sections", () => {
  it("reads only known sections with true/false, and ignores anything broken", () => {
    expect(readFolds(null)).toEqual({});
    expect(readFolds("not json")).toEqual({});
    expect(readFolds("[true]")).toEqual({});
    expect(readFolds(JSON.stringify({ bills: false, budget: true, expenses: "yes", other: true }))).toEqual({ bills: false, budget: true });
  });

  it("opens by itself only when something needs you, until you choose", () => {
    expect(isFoldOpen({}, "bills", true)).toBe(true);
    expect(isFoldOpen({}, "bills", false)).toBe(false);
    expect(isFoldOpen({ bills: false }, "bills", true)).toBe(false);
    expect(isFoldOpen({ expenses: true }, "expenses", false)).toBe(true);
  });

  it("flips what is shown and remembers it", () => {
    expect(toggleFold({}, "bills", true)).toEqual({ bills: false });
    expect(toggleFold({}, "budget", false)).toEqual({ budget: true });
    expect(toggleFold({ budget: true, bills: false }, "budget", false)).toEqual({ budget: false, bills: false });
  });
});

describe("budget for this month", () => {
  it("is null with no limits this month", () => {
    expect(budgetMonthTotal([budget("b1", "food", 500, "SAR", "2026-10-01")], [], "SAR", now)).toBeNull();
  });

  it("adds limits and spending in the main currency and keeps the worst state", () => {
    const budgets = [budget("b1", "food", 500), budget("b2", "transport", 200), budget("b3", "shopping", 100, "USD")];
    const expenses = [expense("e1", "food", 120.5), expense("e2", "transport", 170), expense("e3", "shopping", 999, "2026-11-10T12:00:00", "USD")];
    expect(budgetMonthTotal(budgets, expenses, "SAR", now)).toEqual({ spent: 290.5, limit: 700, state: "near" });
  });

  it("says over when one limit is passed", () => {
    const total = budgetMonthTotal([budget("b1", "food", 100), budget("b2", "transport", 1000)], [expense("e1", "food", 150)], "SAR", now);
    expect(total?.state).toBe("over");
  });
});

describe("cards needing a look", () => {
  it("counts expired cards and ones ending within a month", () => {
    expect(cardsExpiring([card("c1", "2026-10-01"), card("c2", "2026-11-01"), card("c3", "2028-01-01"), card("c4", null)], now)).toBe(2);
  });
});
