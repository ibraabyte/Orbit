import { describe, expect, it } from "vitest";
import { bankSmsApi, canConfirm, isPossibleDuplicate, isSpending, type BankTransaction } from "@/lib/bank-sms";

function fakeApi() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return null as never;
  };
  return { api: { get: record("GET"), post: record("POST"), patch: record("PATCH"), delete: record("DELETE") }, calls };
}

const row = (changes: Partial<BankTransaction> = {}): BankTransaction => ({
  id: "t1",
  bank: "rajhi",
  kind: "purchase",
  amount: 25.5,
  currency: "SAR",
  merchant: "Cafe Demo",
  card_last4: "1234",
  category: "food",
  status: "needs_review",
  review_reasons: ["unverified_bank_format"],
  received_at: "2026-11-01T09:00:00Z",
  expense_id: null,
  ...changes
});

describe("bank SMS", () => {
  it("talks to the server's routes", async () => {
    const { api, calls } = fakeApi();
    await bankSmsApi.status(api);
    await bankSmsApi.newToken(api);
    await bankSmsApi.revokeToken(api);
    await bankSmsApi.toReview(api);
    await bankSmsApi.confirm(api, "t1");
    await bankSmsApi.confirm(api, "t1", "groceries");
    await bankSmsApi.ignore(api, "t1");
    expect(calls).toEqual([
      { method: "GET", path: "/bank-sms/status", body: undefined },
      { method: "POST", path: "/bank-sms/token", body: undefined },
      { method: "DELETE", path: "/bank-sms/token", body: undefined },
      { method: "GET", path: "/bank-sms/transactions?status=needs_review", body: undefined },
      { method: "PATCH", path: "/bank-sms/transactions/t1/review", body: { status: "confirmed" } },
      { method: "PATCH", path: "/bank-sms/transactions/t1/review", body: { status: "confirmed", category: "groceries" } },
      { method: "PATCH", path: "/bank-sms/transactions/t1/review", body: { status: "ignored" } }
    ]);
  });

  it("offers Confirm only when the server would accept it", () => {
    expect(canConfirm(row())).toBe(true);
    expect(canConfirm(row({ amount: null, currency: null }))).toBe(false);
    expect(canConfirm(row({ kind: "unknown" }))).toBe(false);
    expect(canConfirm(row({ kind: "transfer_out" }))).toBe(true);
  });

  it("treats only purchases and fees as spending", () => {
    expect(isSpending(row())).toBe(true);
    expect(isSpending(row({ kind: "fee" }))).toBe(true);
    for (const kind of ["refund", "transfer_in", "transfer_out", "card_payment", "cash_withdrawal", "unknown"] as const) {
      expect(isSpending(row({ kind }))).toBe(false);
    }
  });

  it("spots a possible duplicate", () => {
    expect(isPossibleDuplicate(row())).toBe(false);
    expect(isPossibleDuplicate(row({ review_reasons: ["possible_duplicate"] }))).toBe(true);
  });
});
