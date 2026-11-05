import { describe, expect, it } from "vitest";
import type { Bill, Investment, MoneyAccount, Obligation, ObligationInstallment, PaymentCard } from "@/lib/types";
import {
  buildInstallmentSchedule,
  cardExpiryState,
  cardSubscriptions,
  formatCardExpiry,
  formatPercent,
  installmentAlerts,
  investmentReturn,
  investmentTotals,
  moneyDueSoon,
  moneyTotal,
  monthsHeld,
  normalizeLast4,
  obligationsProgress,
  parseCardExpiry,
  parseMoneyInput,
  wealthSummary
} from "@/lib/wealth";

const now = new Date("2026-11-04T12:00:00+03:00");
const stamp = "2026-11-01T00:00:00Z";

const account = (overrides: Partial<MoneyAccount>): MoneyAccount => ({
  id: "a1", user_id: "u", name: "Main", kind: "bank", balance: 100, currency: "SAR", note: null, created_at: stamp, updated_at: stamp, ...overrides
});
const investment = (overrides: Partial<Investment>): Investment => ({
  id: "i1", user_id: "u", name: "Fund app", kind: "funds", invested: 1000, current_value: 1080, currency: "SAR", started_on: null, note: null, valued_at: stamp, created_at: stamp, updated_at: stamp, ...overrides
});
const card = (overrides: Partial<PaymentCard>): PaymentCard => ({
  id: "c1", user_id: "u", name: "Travel", network: "visa", kind: "credit", last4: "4242", expires_on: null, created_at: stamp, updated_at: stamp, ...overrides
});
const bill = (overrides: Partial<Bill>): Bill => ({
  id: "b1", user_id: "u", name: "Streaming", amount: 45, currency: "SAR", category: "subscriptions", due_at: "2026-11-05", recurrence: "monthly", status: "active", autopay: true, note: null, created_at: stamp, updated_at: stamp, card_id: null, ...overrides
});
const obligation = (overrides: Partial<Obligation>): Obligation => ({
  id: "o1", user_id: "u", name: "Phone", kind: "bnpl", provider: null, total_amount: 400, currency: "SAR", note: null, created_at: stamp, updated_at: stamp, ...overrides
});
const installment = (overrides: Partial<ObligationInstallment>): ObligationInstallment => ({
  id: "n1", user_id: "u", obligation_id: "o1", due_on: "2026-11-01", amount: 100, paid_at: null, created_at: stamp, ...overrides
});

describe("typed amounts", () => {
  it("reads Arabic digits, decimal commas and thousands separators", () => {
    expect(parseMoneyInput("١٢٠")).toBe(120);
    expect(parseMoneyInput("12,5")).toBe(12.5);
    expect(parseMoneyInput("1,500")).toBe(1500);
    expect(parseMoneyInput("1,500.25")).toBe(1500.25);
    expect(parseMoneyInput("0")).toBe(0);
    expect(parseMoneyInput("0", { allowZero: false })).toBeNull();
    expect(parseMoneyInput("-20")).toBeNull();
    expect(parseMoneyInput("-20", { allowNegative: true })).toBe(-20);
    expect(parseMoneyInput("abc")).toBeNull();
  });
});

describe("money and investments", () => {
  it("adds balances in one currency only", () => {
    expect(moneyTotal([account({ balance: 100.1 }), account({ balance: 0.2 }), account({ balance: 50, currency: "USD" })], "SAR")).toBe(100.3);
  });

  it("works out the return in money and percent", () => {
    expect(investmentReturn(investment({}))).toEqual({ gain: 80, percent: 8 });
    expect(investmentReturn(investment({ invested: 0, current_value: 10 })).percent).toBeNull();
    const totals = investmentTotals([investment({}), investment({ invested: 500, current_value: 450 }), investment({ currency: "USD" })], "SAR");
    expect(totals).toMatchObject({ invested: 1500, value: 1530, gain: 30, percent: 2, count: 2 });
    expect(formatPercent(8)).toBe("+8.0%");
    expect(formatPercent(-2.54)).toBe("−2.5%");
    expect(formatPercent(null)).toBe("–");
  });

  it("counts whole months held", () => {
    expect(monthsHeld("2026-01-10", now)).toBe(9);
    expect(monthsHeld("2026-11-05", now)).toBe(0);
    expect(monthsHeld(null, now)).toBeNull();
  });

  it("nets what is owned against what is still owed", () => {
    const summary = wealthSummary(
      { moneyAccounts: [account({ balance: 2000 })], investments: [investment({})], obligations: [obligation({})], obligationInstallments: [installment({ paid_at: stamp }), installment({ id: "n2", due_on: "2026-12-01" })] },
      "SAR",
      now
    );
    expect(summary).toMatchObject({ cash: 2000, owed: 100, net: 2980 });
  });
});

describe("cards", () => {
  it("keeps exactly four digits and nothing longer", () => {
    expect(normalizeLast4("4242")).toBe("4242");
    expect(normalizeLast4("٤٢٤٢")).toBe("4242");
    expect(normalizeLast4("4242424242424242")).toBeNull();
    expect(normalizeLast4("424")).toBeNull();
  });

  it("reads and shows the printed expiry", () => {
    expect(parseCardExpiry("08/28")).toBe("2028-08-01");
    expect(parseCardExpiry("8/2028")).toBe("2028-08-01");
    expect(parseCardExpiry("٠٨/٢٨")).toBe("2028-08-01");
    expect(parseCardExpiry("13/28")).toBeNull();
    expect(formatCardExpiry("2028-08-01")).toBe("08/28");
    expect(cardExpiryState({ expires_on: "2026-11-01" }, now)).toBe("soon");
    expect(cardExpiryState({ expires_on: "2026-10-01" }, now)).toBe("expired");
    expect(cardExpiryState({ expires_on: "2028-08-01" }, now)).toBe("ok");
    expect(cardExpiryState({ expires_on: null }, now)).toBeNull();
  });

  it("lists the active subscriptions on a card with their monthly total", () => {
    const rows = [bill({ card_id: "c1" }), bill({ id: "b2", card_id: "c1", amount: 120, recurrence: "yearly", due_at: "2026-11-02" }), bill({ id: "b3", card_id: "c1", status: "paused" }), bill({ id: "b4" })];
    const result = cardSubscriptions(rows, "c1");
    expect(result.bills.map((row) => row.id)).toEqual(["b2", "b1"]);
    expect(result.monthly).toBe(55);
  });
});

describe("installment plans", () => {
  it("splits a total to the cent", () => {
    const schedule = buildInstallmentSchedule({ total: 100, count: 3, firstDue: "2026-01-31", every: "month", paidFirst: true, now });
    expect(schedule.map((row) => [row.due_on, row.amount])).toEqual([
      ["2026-01-31", 33.34],
      ["2026-02-28", 33.33],
      ["2026-03-31", 33.33]
    ]);
    expect(schedule[0].paid_at).not.toBeNull();
    expect(schedule[1].paid_at).toBeNull();
    expect(buildInstallmentSchedule({ total: 40, count: 2, firstDue: "2026-11-04", every: "two_weeks" }).map((row) => row.due_on)).toEqual(["2026-11-04", "2026-11-18"]);
    expect(buildInstallmentSchedule({ total: 40, count: 0, firstDue: "2026-11-04", every: "week" })).toEqual([]);
  });

  it("shows what is paid, left, next and overdue; finished plans last", () => {
    const rows = [
      installment({ paid_at: stamp }),
      installment({ id: "n2", due_on: "2026-11-03" }),
      installment({ id: "n3", due_on: "2026-12-01" }),
      installment({ id: "x1", obligation_id: "o2", paid_at: stamp })
    ];
    const [open, done] = obligationsProgress({ obligations: [obligation({ id: "o2", name: "Done" }), obligation({})], obligationInstallments: rows }, now);
    expect(open).toMatchObject({ paid: 100, remaining: 200, paidCount: 1, count: 3, done: false });
    expect(open.next?.id).toBe("n2");
    expect(open.overdue.map((row) => row.id)).toEqual(["n2"]);
    expect(done.done).toBe(true);
  });
});

describe("money due", () => {
  it("lists bills and installments that are overdue, due today or tomorrow", () => {
    const data = {
      bills: [bill({ card_id: "c1" }), bill({ id: "b2", due_at: "2026-11-04", name: "Gym" }), bill({ id: "b3", due_at: "2026-11-09" }), bill({ id: "b4", due_at: "2026-11-05", status: "paused" })],
      cards: [card({})],
      obligations: [obligation({})],
      obligationInstallments: [installment({ due_on: "2026-11-02" }), installment({ id: "n2", due_on: "2026-11-05", paid_at: stamp }), installment({ id: "n3", due_on: "2026-11-20" })]
    };
    const due = moneyDueSoon(data, now);
    expect(due.map((item) => [item.id, item.state])).toEqual([
      ["installment-n1", "overdue"],
      ["bill-b2", "today"],
      ["bill-b1", "tomorrow"]
    ]);
    expect(due[2].card?.last4).toBe("4242");
  });

  it("alarms the day before each unpaid installment", () => {
    const alerts = installmentAlerts(
      { obligations: [obligation({})], obligationInstallments: [installment({ due_on: "2026-11-04" }), installment({ id: "n2", due_on: "2026-11-10" }), installment({ id: "n3", due_on: "2026-11-12", paid_at: stamp })] },
      now
    );
    expect(alerts.map((alert) => alert.id)).toEqual(["installment-n2-2026-11-10"]);
    expect(alerts[0].at.getDate()).toBe(9);
    expect(alerts[0].at.getHours()).toBe(9);
    expect(alerts[0].title).toBe("Phone installment is due tomorrow");
  });
});
