import { addMonths, billDay, monthlyCommitments } from "@/lib/finance";
import { localDateKey } from "@/lib/insights";
import type { Bill, DashboardData, Investment, MoneyAccount, Obligation, ObligationInstallment, PaymentCard } from "@/lib/types";

// Where money is, investments, cards and installment plans. Everything is worked out here on the phone from
// the rows the server sends; totals only add rows in one currency (the main one), like the rest of Finance.

const day = (value: string) => billDay(value);
const cents = (value: number) => Math.round(Number(value) * 100);

/** A typed amount: Arabic digits, a decimal comma and a thousands comma ("1,500") are fine, and a leading minus when allowed. */
export function parseMoneyInput(text: string, { allowNegative = false, allowZero = true } = {}) {
  const trimmed = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ",")
    .replace(/\s/g, "");
  const negative = /^[-−]/.test(trimmed);
  const body = trimmed.replace(/^[-−]/, "");
  const western = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(body) ? body.replace(/,/g, "") : body.replace(/[٫,]/g, ".");
  if (!/^\d+(\.\d+)?$/.test(western)) return null;
  const value = (negative ? -1 : 1) * (Math.round(Number(western) * 100) / 100);
  if (negative && !allowNegative) return null;
  if (value === 0 && !allowZero) return null;
  return Math.abs(value) < 1e12 ? value : null;
}

// Where money is

export function moneyTotal(accounts: MoneyAccount[], currency: string) {
  return accounts.filter((account) => account.currency === currency).reduce((sum, account) => sum + cents(account.balance), 0) / 100;
}

// Investments

export function investmentReturn(investment: Pick<Investment, "invested" | "current_value">) {
  const gain = (cents(investment.current_value) - cents(investment.invested)) / 100;
  const percent = Number(investment.invested) > 0 ? (gain / Number(investment.invested)) * 100 : null;
  return { gain, percent };
}

export function investmentTotals(investments: Investment[], currency: string) {
  const rows = investments.filter((investment) => investment.currency === currency);
  const invested = rows.reduce((sum, row) => sum + cents(row.invested), 0) / 100;
  const value = rows.reduce((sum, row) => sum + cents(row.current_value), 0) / 100;
  return { invested, value, ...investmentReturn({ invested, current_value: value }), count: rows.length };
}

/** Whole months from the start day to now (0 for a start in the future or this month). */
export function monthsHeld(startedOn: string | null, now = new Date()) {
  if (!startedOn) return null;
  const start = day(startedOn);
  let months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

/** "+8.0%" / "−2.5%"; the sign is always written so the direction isn't left to colour. */
export function formatPercent(percent: number | null) {
  if (percent === null) return "–";
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(1)}%`;
}

// Cards

/** Exactly four digits (Arabic digits too), or null. A longer number is refused rather than cut, so a full card number is never taken in. */
export function normalizeLast4(text: string) {
  const digits = text.trim().replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  return /^\d{4}$/.test(digits) ? digits : null;
}

/** "08/28", "8/2028" or "٠٨/٢٨" to the month's first day ("2028-08-01"), or null. */
export function parseCardExpiry(text: string) {
  const western = text.trim().replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const match = western.match(/^(\d{1,2})\s*[/\-.]\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2099) return null;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function formatCardExpiry(expiresOn: string | null) {
  return expiresOn ? `${expiresOn.slice(5, 7)}/${expiresOn.slice(2, 4)}` : null;
}

/** A card works to the end of the month printed on it. */
export function cardExpiryState(card: Pick<PaymentCard, "expires_on">, now = new Date(), warnDays = 30): "expired" | "soon" | "ok" | null {
  if (!card.expires_on) return null;
  const end = addMonths(day(card.expires_on), 1);
  end.setDate(1);
  end.setHours(0, 0, 0, 0);
  if (now >= end) return "expired";
  return end.getTime() - now.getTime() <= warnDays * 86_400_000 ? "soon" : "ok";
}

export function cardLabel(card: Pick<PaymentCard, "name" | "last4">) {
  return `${card.name} ·· ${card.last4}`;
}

/** Active bills charged to this card, soonest first, and what they cost a month together. */
export function cardSubscriptions(bills: Bill[], cardId: string) {
  const rows = bills.filter((bill) => bill.card_id === cardId && bill.status === "active").sort((a, b) => a.due_at.localeCompare(b.due_at));
  return { bills: rows, monthly: monthlyCommitments(rows) };
}

// Obligations and installments

export type ObligationProgress = {
  obligation: Obligation;
  installments: ObligationInstallment[];
  paid: number;
  remaining: number;
  paidCount: number;
  count: number;
  next: ObligationInstallment | null;
  overdue: ObligationInstallment[];
  done: boolean;
};

export function obligationProgress(obligation: Obligation, all: ObligationInstallment[], now = new Date()): ObligationProgress {
  const installments = all.filter((row) => row.obligation_id === obligation.id).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const unpaid = installments.filter((row) => !row.paid_at);
  const today = localDateKey(now);
  const paid = installments.filter((row) => row.paid_at).reduce((sum, row) => sum + cents(row.amount), 0) / 100;
  const remaining = unpaid.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
  return {
    obligation,
    installments,
    paid,
    remaining,
    paidCount: installments.length - unpaid.length,
    count: installments.length,
    next: unpaid[0] ?? null,
    overdue: unpaid.filter((row) => row.due_on.slice(0, 10) < today),
    done: installments.length > 0 && unpaid.length === 0
  };
}

/** Open plans first (soonest next payment), finished ones last. */
export function obligationsProgress(data: Pick<DashboardData, "obligations" | "obligationInstallments">, now = new Date()) {
  return data.obligations
    .map((obligation) => obligationProgress(obligation, data.obligationInstallments, now))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.next?.due_on ?? "9999").localeCompare(b.next?.due_on ?? "9999"));
}

export function obligationsRemaining(data: Pick<DashboardData, "obligations" | "obligationInstallments">, currency: string, now = new Date()) {
  return (
    obligationsProgress(data, now)
      .filter((row) => row.obligation.currency === currency)
      .reduce((sum, row) => sum + cents(row.remaining), 0) / 100
  );
}

export type InstallmentEvery = "month" | "two_weeks" | "week";

/**
 * Splits a total into `count` payments to the cent; the first ones carry the leftover cents so they add up exactly.
 * paidFirst marks the first one as paid now (most pay-later plans take it at checkout).
 */
export function buildInstallmentSchedule({
  total,
  count,
  firstDue,
  every,
  paidFirst = false,
  now = new Date()
}: {
  total: number;
  count: number;
  firstDue: string;
  every: InstallmentEvery;
  paidFirst?: boolean;
  now?: Date;
}) {
  if (!(total > 0) || !Number.isInteger(count) || count < 1 || count > 360) return [];
  const totalCents = cents(total);
  const base = Math.floor(totalCents / count);
  const extra = totalCents - base * count;
  const start = day(firstDue);
  return Array.from({ length: count }, (_, index) => {
    const due = every === "month" ? addMonths(start, index) : new Date(start.getFullYear(), start.getMonth(), start.getDate() + index * (every === "week" ? 7 : 14), 12);
    return {
      due_on: localDateKey(due),
      amount: (base + (index < extra ? 1 : 0)) / 100,
      paid_at: paidFirst && index === 0 ? now.toISOString() : null
    };
  }).filter((row) => row.amount > 0);
}

// What is due: shown on Today and alarmed the day before.

export type MoneyDue = {
  id: string;
  kind: "bill" | "installment";
  title: string;
  amount: number;
  currency: string;
  due: string;
  state: "overdue" | "today" | "tomorrow";
  bill?: Bill;
  installment?: ObligationInstallment;
  card?: PaymentCard;
};

export function moneyDueSoon(data: Pick<DashboardData, "bills" | "cards" | "obligations" | "obligationInstallments">, now = new Date()): MoneyDue[] {
  const today = localDateKey(now);
  const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
  const state = (due: string): MoneyDue["state"] | null => (due < today ? "overdue" : due === today ? "today" : due === tomorrow ? "tomorrow" : null);
  const names = new Map(data.obligations.map((row) => [row.id, row]));
  const items: MoneyDue[] = [];

  for (const bill of data.bills) {
    const due = bill.due_at.slice(0, 10);
    const when = bill.status === "active" ? state(due) : null;
    if (!when) continue;
    const card = data.cards.find((row) => row.id === bill.card_id);
    items.push({ id: `bill-${bill.id}`, kind: "bill", title: bill.name, amount: Number(bill.amount), currency: bill.currency, due, state: when, bill, card });
  }
  for (const installment of data.obligationInstallments) {
    const obligation = names.get(installment.obligation_id);
    const due = installment.due_on.slice(0, 10);
    const when = installment.paid_at ? null : state(due);
    if (!when || !obligation) continue;
    items.push({ id: `installment-${installment.id}`, kind: "installment", title: obligation.name, amount: Number(installment.amount), currency: obligation.currency, due, state: when, installment });
  }
  return items.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}

export type MoneyAlert = { id: string; title: string; body: string; at: Date; url: string };

/** A heads-up at 9:00 the day before each unpaid installment. */
export function installmentAlerts(data: Pick<DashboardData, "obligations" | "obligationInstallments">, now = new Date(), formatAmount: (amount: number, currency: string) => string = (a, c) => `${a} ${c}`): MoneyAlert[] {
  const names = new Map(data.obligations.map((row) => [row.id, row]));
  return data.obligationInstallments
    .flatMap((installment) => {
      const obligation = names.get(installment.obligation_id);
      if (!obligation || installment.paid_at) return [];
      const at = day(installment.due_on);
      at.setDate(at.getDate() - 1);
      at.setHours(9, 0, 0, 0);
      return [
        {
          id: `installment-${installment.id}-${installment.due_on}`,
          title: `${obligation.name} installment is due tomorrow`,
          body: `${formatAmount(Number(installment.amount), obligation.currency)} on ${installment.due_on.slice(0, 10)}.`,
          at,
          url: "/obligations"
        }
      ];
    })
    .filter((alert) => alert.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Everything owned minus what is still owed, in one currency. */
export function wealthSummary(data: Pick<DashboardData, "moneyAccounts" | "investments" | "obligations" | "obligationInstallments">, currency: string, now = new Date()) {
  const cash = moneyTotal(data.moneyAccounts, currency);
  const investments = investmentTotals(data.investments, currency);
  const owed = obligationsRemaining(data, currency, now);
  return { cash, investments, owed, net: (cents(cash) + cents(investments.value) - cents(owed)) / 100 };
}
