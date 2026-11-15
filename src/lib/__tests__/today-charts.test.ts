import { describe, expect, it } from "vitest";
import { runningTotal, sleepWeek, spendWeek } from "@/lib/today-charts";
import type { Expense, SleepLog } from "@/lib/types";

const now = new Date(2026, 10, 15, 16, 0);

describe("today charts", () => {
  it("puts each night's sleep on its day, today last", () => {
    const logs = [{ sleep_date: "2026-11-15", duration_minutes: 450 }, { sleep_date: "2026-11-09", duration_minutes: 360 }, { sleep_date: "2026-11-01", duration_minutes: 500 }] as SleepLog[];
    expect(sleepWeek(logs, now)).toEqual([6, 0, 0, 0, 0, 0, 7.5]);
  });

  it("adds spending per day in one currency only", () => {
    const at = (day: number) => new Date(2026, 10, day, 13).toISOString();
    const expenses = [
      { spent_at: at(15), amount: 20, currency: "AED" },
      { spent_at: at(15), amount: 5, currency: "AED" },
      { spent_at: at(14), amount: 99, currency: "USD" }
    ] as Expense[];
    expect(spendWeek(expenses, "AED", now)).toEqual([0, 0, 0, 0, 0, 0, 25]);
  });

  it("keeps a running total", () => {
    expect(runningTotal([1, 0, 2])).toEqual([1, 1, 3]);
  });
});
