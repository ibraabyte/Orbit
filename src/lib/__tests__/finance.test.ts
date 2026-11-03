import { describe, expect, it } from "vitest";
import {
  activeSubscriptions,
  billRenewalAlerts,
  budgetProgress,
  budgetsToCopy,
  mainCurrency,
  monthKey,
  newBudgetAlerts,
  parseBudgetAmount,
  shiftMonth,
  subscriptionMonthlyTotal,
  financeSummary,
  formatMoney,
  nextBillDueDate,
  spendingByCategory,
  spendingByDay,
  upcomingBills,
  overdueBills
} from "@/lib/finance";
import type { Bill, Budget, Expense } from "@/lib/types";

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

describe("subscriptions", () => {
  const netflix = bill({ id: "netflix", name: "Netflix", category: "subscriptions", amount: 45, currency: "SAR", due_at: "2026-07-20", recurrence: "monthly" });
  const icloud = bill({ id: "icloud", name: "iCloud", category: "subscriptions", amount: 120, currency: "SAR", due_at: "2026-07-17", recurrence: "yearly" });
  const paused = bill({ id: "paused", category: "subscriptions", status: "paused", due_at: "2026-07-18" });
  const rent = bill({ id: "rent", name: "Rent", category: "home", amount: 3000, currency: "SAR", due_at: "2026-08-01", autopay: false });

  it("lists active subscriptions by renewal date and totals them per month", () => {
    expect(activeSubscriptions([netflix, icloud, paused, rent]).map((item) => item.id)).toEqual(["icloud", "netflix"]);
    expect(subscriptionMonthlyTotal([netflix, icloud, paused, rent])).toBe(55);
  });

  it("alerts three days before each active bill, skipping ones already inside the window", () => {
    const alerts = billRenewalAlerts([netflix, icloud, paused, rent], now);
    // iCloud's heads-up (Jul 14) is already past on Jul 15.
    expect(alerts.map((alert) => alert.id)).toEqual(["bill-netflix-2026-07-20", "bill-rent-2026-08-01"]);
    expect(alerts[0].title).toBe("Netflix renews in 3 days");
    expect(alerts[0].at.getDate()).toBe(17);
    expect(alerts[0].at.getHours()).toBe(9);
    expect(alerts[1].title).toBe("Rent is due in 3 days");
  });
});

function budget(overrides: Partial<Budget>): Budget {
  return {
    id: "budget-1",
    user_id: "user-1",
    month: "2026-07-01",
    category: "food",
    amount: 100,
    currency: "USD",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("months", () => {
  it("names a month by its first local day and steps across years", () => {
    expect(monthKey(new Date("2026-07-15T12:00:00.000Z"))).toBe("2026-07-01");
    // 31 Dec 22:00 UTC is already 1 Jan in Riyadh.
    expect(monthKey(new Date("2026-12-31T22:00:00.000Z"))).toBe("2027-01-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });
});

describe("budgetProgress", () => {
  const month = "2026-07-01";

  it("counts only expenses in the same month, category and currency", () => {
    const rows = budgetProgress(
      [budget({})],
      [
        expense({ id: "a", amount: 30 }),
        expense({ id: "b", amount: 20.5, spent_at: "2026-07-02T08:00:00.000Z" }),
        expense({ id: "other-category", amount: 99, category: "home" }),
        expense({ id: "other-currency", amount: 99, currency: "SAR" }),
        expense({ id: "last-month", amount: 99, spent_at: "2026-06-30T08:00:00.000Z" }),
        expense({ id: "next-month", amount: 99, spent_at: "2026-08-01T08:00:00.000Z" })
      ],
      month
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spent: 50.5, limit: 100, ratio: 0.505, state: "ok" });
  });

  it("draws the month boundary on the local day", () => {
    // 30 Jun 21:30 UTC is 1 Jul 00:30 in Riyadh: July. 31 Jul 21:30 UTC is 1 Aug in Riyadh: August.
    const rows = budgetProgress(
      [budget({})],
      [expense({ id: "in", amount: 10, spent_at: "2026-06-30T21:30:00.000Z" }), expense({ id: "out", amount: 5, spent_at: "2026-07-31T21:30:00.000Z" })],
      month
    );
    expect(rows[0].spent).toBe(10);
  });

  it("only returns budgets of the asked month", () => {
    const rows = budgetProgress([budget({ id: "jul" }), budget({ id: "aug", month: "2026-08-01" })], [], month);
    expect(rows.map((row) => row.budget.id)).toEqual(["jul"]);
  });

  it("is ok below 80%, near from 80% to just under 100%, over from 100%", () => {
    const state = (spent: number) => budgetProgress([budget({})], [expense({ amount: spent })], month)[0].state;
    expect(state(0)).toBe("ok");
    expect(state(79.99)).toBe("ok");
    expect(state(80)).toBe("near");
    expect(state(99.99)).toBe("near");
    expect(state(100)).toBe("over");
    expect(state(250)).toBe("over");
  });

  it("is not thrown off by cents adding up in floating point", () => {
    const expenses = [expense({ id: "a", amount: 10.1 }), expense({ id: "b", amount: 20.2 }), expense({ id: "c", amount: 20.1 })];
    expect(budgetProgress([budget({ amount: 63 })], expenses, month)[0]).toMatchObject({ spent: 50.4, state: "near" });
    expect(budgetProgress([budget({ amount: 50.4 })], expenses, month)[0].state).toBe("over");
  });

  it("orders rows like the category list so bars do not jump around", () => {
    const rows = budgetProgress([budget({ id: "o", category: "other" }), budget({ id: "f", category: "food" }), budget({ id: "t", category: "transport" })], [], month);
    expect(rows.map((row) => row.budget.category)).toEqual(["food", "transport", "other"]);
  });
});

describe("budgetsToCopy", () => {
  const rows = [
    budget({ id: "may", month: "2026-05-01", category: "food", amount: 10 }),
    budget({ id: "jun-food", month: "2026-06-01", category: "food", amount: 600 }),
    budget({ id: "jun-home", month: "2026-06-01", category: "home", amount: 900 }),
    budget({ id: "aug", month: "2026-08-01", category: "food", amount: 700 })
  ];

  it("takes the most recent earlier month that has limits", () => {
    expect(budgetsToCopy(rows, "2026-07-01").map((row) => row.id)).toEqual(["jun-food", "jun-home"]);
    // A gap in between does not matter.
    expect(budgetsToCopy(rows, "2026-12-01").map((row) => row.id)).toEqual(["aug"]);
  });

  it("skips categories that already have a limit in the target month", () => {
    const withHome = [...rows, budget({ id: "jul-home", month: "2026-07-01", category: "home", amount: 1 })];
    expect(budgetsToCopy(withHome, "2026-07-01").map((row) => row.id)).toEqual(["jun-food"]);
  });

  it("returns nothing when no earlier month has limits or everything is already set", () => {
    expect(budgetsToCopy(rows, "2026-05-01")).toEqual([]);
    expect(budgetsToCopy([], "2026-07-01")).toEqual([]);
    const full = [budget({ id: "jun", month: "2026-06-01" }), budget({ id: "jul", month: "2026-07-01" })];
    expect(budgetsToCopy(full, "2026-07-01")).toEqual([]);
  });
});

describe("newBudgetAlerts", () => {
  const month = "2026-07-01";
  const rows = (spent: number, category: Budget["category"] = "food") => budgetProgress([budget({ category })], [expense({ amount: spent, category })], month);

  it("alerts once when a budget reaches 80% and once at 100%", () => {
    const first = newBudgetAlerts(rows(85), []);
    expect(first.alerts.map((alert) => [alert.category, alert.threshold, alert.id])).toEqual([["food", 80, "budget-2026-07-01-food-80"]]);

    const again = newBudgetAlerts(rows(90), first.fired);
    expect(again.alerts).toEqual([]);

    const over = newBudgetAlerts(rows(120), again.fired);
    expect(over.alerts.map((alert) => alert.threshold)).toEqual([100]);
    expect(newBudgetAlerts(rows(150), over.fired).alerts).toEqual([]);
  });

  it("sends only the highest threshold when a load jumps past both, and never sends the lower one later", () => {
    const jump = newBudgetAlerts(rows(120), []);
    expect(jump.alerts.map((alert) => alert.threshold)).toEqual([100]);
    expect(jump.fired).toEqual(expect.arrayContaining(["2026-07-01:food:80", "2026-07-01:food:100"]));
    // Spending falls back under 100% (an expense was deleted) and rises again: nothing new.
    expect(newBudgetAlerts(rows(85), jump.fired).alerts).toEqual([]);
  });

  it("stays quiet below 80% and keeps categories and months apart", () => {
    expect(newBudgetAlerts(rows(79), []).alerts).toEqual([]);
    const food = newBudgetAlerts(rows(85), []);
    expect(newBudgetAlerts(rows(85, "home"), food.fired).alerts.map((alert) => alert.category)).toEqual(["home"]);
    const nextMonth = budgetProgress([budget({ month: "2026-08-01" })], [expense({ amount: 85, spent_at: "2026-08-02T08:00:00.000Z" })], "2026-08-01");
    expect(newBudgetAlerts(nextMonth, food.fired).alerts.map((alert) => alert.id)).toEqual(["budget-2026-08-01-food-80"]);
  });

  it("carries the figures the notification text needs and does not repeat a remembered key", () => {
    const [alert] = newBudgetAlerts(rows(85), []).alerts;
    expect(alert).toMatchObject({ spent: 85, limit: 100, currency: "USD", state: "near" });
    const fired = newBudgetAlerts(rows(85), []).fired;
    expect(newBudgetAlerts(rows(85), fired).fired).toEqual(fired);
  });
});

describe("parseBudgetAmount", () => {
  it("reads typed limits, including Arabic digits and a decimal comma", () => {
    expect(parseBudgetAmount("800")).toBe(800);
    expect(parseBudgetAmount(" 12.5 ")).toBe(12.5);
    expect(parseBudgetAmount("12,5")).toBe(12.5);
    expect(parseBudgetAmount("٨٠٠")).toBe(800);
    expect(parseBudgetAmount("١٢٫٥")).toBe(12.5);
    expect(parseBudgetAmount("10.456")).toBe(10.46);
  });

  it("refuses anything the server would refuse", () => {
    for (const text of ["", "abc", "0", "-5", "1.2.3", "99999999999"]) expect(parseBudgetAmount(text)).toBeNull();
  });

  it("reads a comma before exactly three digits as a thousands separator", () => {
    expect(parseBudgetAmount("1,500")).toBe(1500);
    expect(parseBudgetAmount("1,500,000")).toBe(1500000);
    expect(parseBudgetAmount("١٬٥٠٠")).toBe(1500);
    expect(parseBudgetAmount("١٥٠٠")).toBe(1500);
    // Anything else with a comma is still a decimal comma.
    expect(parseBudgetAmount("1,5")).toBe(1.5);
    expect(parseBudgetAmount("12,50")).toBe(12.5);
    // Mixed separators are refused rather than guessed.
    expect(parseBudgetAmount("1.500,25")).toBeNull();
  });
});

describe("mainCurrency", () => {
  it("is the most common expense currency, not the newest one", () => {
    const expenses = [expense({ currency: "USD" }), expense({ currency: "SAR" }), expense({ currency: "SAR" })];
    expect(mainCurrency(expenses, [bill({ currency: "EUR" })])).toBe("SAR");
  });

  it("falls back to bills, then SAR", () => {
    expect(mainCurrency([], [bill({ currency: "EUR" }), bill({ currency: "AED" }), bill({ currency: "AED" })])).toBe("AED");
    expect(mainCurrency([], [])).toBe("SAR");
  });
});
