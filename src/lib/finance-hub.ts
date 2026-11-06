import { budgetProgress, monthKey, type BudgetState } from "@/lib/finance";
import { isArabic } from "@/lib/i18n";
import type { Budget, Expense, PaymentCard } from "@/lib/types";
import { cardExpiryState } from "@/lib/wealth";

// Finance is one place: this month's numbers on top, then where the money is, investments, cards and
// installments under it, and spending, bills and the budget as sections that fold away.

const en = {
  thisMonth: "This month",
  inFinance: "In Finance",
  expenses: "Expenses",
  billsAndSubs: "Bills & subscriptions",
  netWorth: "Net worth",
  spentMonth: "Spent",
  spentToday: "Today",
  bills: "Bills a month",
  budgetUsed: "Budget",
  moneyPlacesDetail: "Banks, savings, wallets, cash",
  investmentsDetail: "Funds, stocks, sukuk, gold",
  cardsDetail: "Last 4 digits and what each one pays",
  obligationsDetail: "What's paid and what's left",
  overdue: (n: number) => `${n} overdue`,
  due: (n: number) => `${n} due`,
  subs: (n: number) => `${n} subscriptions`,
  cardsCount: (n: number) => `${n} cards`,
  cardsExpiring: (n: number) => `${n} expiring`,
  show: "Show",
  hide: "Hide"
};

const ar: typeof en = {
  thisMonth: "هذا الشهر",
  inFinance: "داخل المالية",
  expenses: "المصاريف",
  billsAndSubs: "الفواتير والاشتراكات",
  netWorth: "صافي الثروة",
  spentMonth: "صرفت",
  spentToday: "اليوم",
  bills: "فواتير الشهر",
  budgetUsed: "الميزانية",
  moneyPlacesDetail: "البنوك والادخار والمحافظ والكاش",
  investmentsDetail: "الصناديق والأسهم والصكوك والذهب",
  cardsDetail: "آخر ٤ أرقام ووش ينخصم على كل وحدة",
  obligationsDetail: "المدفوع والمتبقي",
  overdue: (n: number) => `${n} متأخرة`,
  due: (n: number) => `${n} قادمة`,
  subs: (n: number) => `${n} اشتراك`,
  cardsCount: (n: number) => `${n} بطاقات`,
  cardsExpiring: (n: number) => `${n} تنتهي قريب`,
  show: "عرض",
  hide: "إخفاء"
};

export const fh = isArabic ? ar : en;

export type FoldKey = "expenses" | "bills" | "budget";
export type Folds = Partial<Record<FoldKey, boolean>>;

const foldKeys: FoldKey[] = ["expenses", "bills", "budget"];

/** Saved open/closed choices; anything unreadable counts as nothing saved. */
export function readFolds(saved: string | null): Folds {
  if (!saved) return {};
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const folds: Folds = {};
    for (const key of foldKeys) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "boolean") folds[key] = value;
    }
    return folds;
  } catch {
    return {};
  }
}

/** A section's own choice wins; until you pick, it opens only when something in it needs you. */
export function isFoldOpen(folds: Folds, key: FoldKey, needsYou: boolean) {
  return folds[key] ?? needsYou;
}

export function toggleFold(folds: Folds, key: FoldKey, needsYou: boolean): Folds {
  return { ...folds, [key]: !isFoldOpen(folds, key, needsYou) };
}

/** This month's limits added up in one currency, and the worst state among them. Null with no limits. */
export function budgetMonthTotal(budgets: Budget[], expenses: Expense[], currency: string, now = new Date()): { spent: number; limit: number; state: BudgetState } | null {
  const rows = budgetProgress(budgets, expenses, monthKey(now)).filter((row) => row.budget.currency === currency);
  if (!rows.length) return null;
  const cents = (value: number) => Math.round(value * 100);
  const spent = rows.reduce((sum, row) => sum + cents(row.spent), 0) / 100;
  const limit = rows.reduce((sum, row) => sum + cents(row.limit), 0) / 100;
  const state: BudgetState = rows.some((row) => row.state === "over") ? "over" : rows.some((row) => row.state === "near") ? "near" : "ok";
  return { spent, limit, state };
}

/** Cards that have expired or end within a month. */
export function cardsExpiring(cards: PaymentCard[], now = new Date()) {
  return cards.filter((card) => {
    const state = cardExpiryState(card, now);
    return state === "expired" || state === "soon";
  }).length;
}
