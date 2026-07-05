import { describe, expect, it } from "vitest";
import {
  financeSummary,
  formatMoney,
  nextBillDueDate,
  spendingByCategory,
  spendingByDay,
  upcomingBills,
  overdueBills
} from "@/lib/finance";
import type { Bill, Expense } from "@/lib/types";

const now = new Date("2026-07-15T12:00:00.000Z");

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "expense-1",
    user_id: "user-1",
    merchant: "Coffee",
    amount: 10,
    currency: "USD",
    category: "food",
    note: null,
    spent_at: "2026-07-15T08:00:00.000Z",
    created_at: "2026-07-15T08:00:00.000Z",
    ...overrides
  };
}

function bill(overrides: Partial<Bill>): Bill {
  return {
    id: "bill-1",
    user_id: "user-1",
    name: "Internet",
    amount: 65,
    currency: "USD",
    category: "home",
    due_at: "2026-07-16",
    recurrence: "monthly",
    status: "active",
    autopay: false,
    note: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("finance", () => {
  it("summarizes current month spending and bill pressure", () => {
    const data = {
      expenses: [
        expense({ id: "expense-1", amount: 10, category: "food" }),
        expense({ id: "expense-2", amount: 25, category: "home", spent_at: "2026-07-02T08:00:00.000Z" }),
        expense({ id: "expense-old", amount: 99, spent_at: "2026-06-30T08:00:00.000Z" })
      ],
      bills: [
        bill({ id: "bill-upcoming", due_at: "2026-07-16", amount: 65 }),
        bill({ id: "bill-overdue", due_at: "2026-07-10", amount: 20, recurrence: "weekly" }),
        bill({ id: "bill-paid", due_at: "2026-07-12", status: "paid", amount: 40 })
      ]
    };

    expect(financeSummary(data, now)).toMatchObject({
      monthSpend: 35,
      monthExpenseCount: 2,
      todaySpend: 10,
      monthlyCommitments: 152
    });
    expect(upcomingBills(data.bills, 30, now).map((item) => item.id)).toEqual(["bill-upcoming"]);
    expect(overdueBills(data.bills, now).map((item) => item.id)).toEqual(["bill-overdue"]);
    expect(spendingByCategory(data.expenses, now).map((item) => [item.category, item.total])).toEqual([
      ["home", 25],
      ["food", 10]
    ]);
  });

  it("builds daily spending bars and stable money labels", () => {
    const data = {
      expenses: [
        expense({ amount: 10 }),
        expense({ id: "expense-2", amount: 5, spent_at: "2026-07-15T18:00:00.000Z" })
      ]
    };

    expect(spendingByDay(data, 1, now)).toEqual([{ date: "2026-07-15", label: "Wed", value: 15 }]);
    expect(formatMoney(12, "USD")).toBe("$12");
  });

  it("advances recurring bills and marks one-time bills as completeable", () => {
    expect(nextBillDueDate(bill({ due_at: "2026-06-10", recurrence: "monthly" }), now)).toBe("2026-08-10");
    expect(nextBillDueDate(bill({ due_at: "2026-01-31", recurrence: "monthly" }), new Date("2026-02-01T12:00:00.000Z"))).toBe(
      "2026-02-28"
    );
    expect(nextBillDueDate(bill({ recurrence: "once" }), now)).toBeNull();
  });
});
