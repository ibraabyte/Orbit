import { digits } from "@/lib/i18n";
import { localDateKey, localDayOf, lastDays, type DailyMetric } from "@/lib/insights";
import type { Bill, BillRecurrence, Budget, DashboardData, Expense, FinanceCategory } from "@/lib/types";

export const financeCategories: FinanceCategory[] = [
  "food",
  "transport",
  "fitness",
  "home",
  "subscriptions",
  "shopping",
  "health",
  "travel",
  "groceries",
  "bills",
  "services",
  "other"
];

export type CategorySpend = {
  category: FinanceCategory;
  total: number;
  count: number;
};

export function normalizeCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
}

export function formatMoney(amount: number, currency = "USD") {
  try {
    return digits(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: normalizeCurrency(currency),
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2
      }).format(amount)
    );
  } catch {
    return `${normalizeCurrency(currency)} ${digits(amount.toFixed(2))}`;
  }
}

export function expensesInCurrentMonth(expenses: Expense[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return expenses.filter((expense) => {
    const spentAt = new Date(expense.spent_at);
    return spentAt >= start && spentAt < end;
  });
}

export function spendingByCategory(expenses: Expense[], now = new Date()): CategorySpend[] {
  const totals = new Map<FinanceCategory, CategorySpend>();
  for (const expense of expensesInCurrentMonth(expenses, now)) {
    const current = totals.get(expense.category) ?? { category: expense.category, total: 0, count: 0 };
    current.total += Number(expense.amount);
    current.count += 1;
    totals.set(expense.category, current);
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

export function spendingByDay(data: Pick<DashboardData, "expenses">, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.expenses
      .filter((expense) => localDayOf(expense.spent_at) === day.date)
      .reduce((sum, expense) => sum + Number(expense.amount), 0)
  }));
}

export function upcomingBills(bills: Bill[], days = 30, now = new Date()) {
  const today = startOfDay(now);
  const end = new Date(today);
  end.setDate(end.getDate() + days);

  return bills
    .filter((bill) => bill.status === "active")
    .filter((bill) => {
      const dueAt = billDate(bill.due_at);
      return dueAt >= today && dueAt <= end;
    })
    .sort((a, b) => billDate(a.due_at).getTime() - billDate(b.due_at).getTime());
}

export function overdueBills(bills: Bill[], now = new Date()) {
  const today = startOfDay(now);
  return bills
    .filter((bill) => bill.status === "active" && billDate(bill.due_at) < today)
    .sort((a, b) => billDate(a.due_at).getTime() - billDate(b.due_at).getTime());
}

export function monthlyCommitments(bills: Bill[]) {
  return Math.round(
    bills
      .filter((bill) => bill.status === "active" && bill.recurrence !== "once")
      .reduce((sum, bill) => sum + monthlyValue(bill.amount, bill.recurrence), 0)
  );
}

export function financeSummary(data: Pick<DashboardData, "expenses" | "bills">, now = new Date()) {
  const monthExpenses = expensesInCurrentMonth(data.expenses, now);
  const monthSpend = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const today = localDateKey(now);
  const todaySpend = data.expenses
    .filter((expense) => localDayOf(expense.spent_at) === today)
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const categories = spendingByCategory(data.expenses, now);

  return {
    monthSpend,
    monthExpenseCount: monthExpenses.length,
    todaySpend,
    topCategory: categories[0] ?? null,
    overdueBills: overdueBills(data.bills, now),
    upcomingBills: upcomingBills(data.bills, 30, now),
    monthlyCommitments: monthlyCommitments(data.bills)
  };
}

export function nextBillDueDate(bill: Bill, now = new Date()) {
  if (bill.recurrence === "once") return null;

  let next = billDate(bill.due_at);
  const today = startOfDay(now);

  do {
    next = addRecurrence(next, bill.recurrence);
  } while (next <= today);

  return localDateKey(next);
}

function monthlyValue(amount: number, recurrence: BillRecurrence) {
  if (recurrence === "weekly") return Number(amount) * 4.33;
  if (recurrence === "monthly") return Number(amount);
  if (recurrence === "yearly") return Number(amount) / 12;
  return 0;
}

function addRecurrence(date: Date, recurrence: BillRecurrence) {
  if (recurrence === "weekly") {
    const next = new Date(date);
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (recurrence === "yearly") {
    return addMonths(date, 12);
  }

  return addMonths(date, 1);
}

export function addMonths(date: Date, months: number) {
  const day = date.getDate();
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function billDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

/** A stored date ("2026-07-20") as local noon that day, so time zones never move it. */
export const billDay = billDate;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Subscriptions are bills in the "subscriptions" category (Netflix, Spotify, ...).
export function activeSubscriptions(bills: Bill[]) {
  return bills
    .filter((bill) => bill.category === "subscriptions" && bill.status === "active")
    .sort((a, b) => billDate(a.due_at).getTime() - billDate(b.due_at).getTime());
}

export function subscriptionMonthlyTotal(bills: Bill[]) {
  return monthlyCommitments(activeSubscriptions(bills));
}

export type BillAlert = { id: string; title: string; body: string; at: Date; url: string };

// A heads-up `daysBefore` a bill is due (the day before by default), at 9:00 local, so a renewal can still be cancelled.
// The hour heads-ups go out on the day; 9:00 unless Notifications says otherwise.
export type AlertTime = { hour: number; minute: number };
export const NINE_AM: AlertTime = { hour: 9, minute: 0 };

export function billRenewalAlerts(bills: Bill[], now = new Date(), daysBefore = 1, time: AlertTime = NINE_AM): BillAlert[] {
  return bills
    .filter((bill) => bill.status === "active")
    .map((bill) => {
      const at = billDate(bill.due_at);
      at.setDate(at.getDate() - daysBefore);
      at.setHours(time.hour, time.minute, 0, 0);
      const renews = bill.category === "subscriptions" || bill.autopay;
      const when = daysBefore === 1 ? "tomorrow" : `in ${daysBefore} days`;
      return {
        id: `bill-${bill.id}-${bill.due_at}`,
        title: renews ? `${bill.name} renews ${when}` : `${bill.name} is due ${when}`,
        body: `${formatMoney(bill.amount, bill.currency)} on ${bill.due_at}${renews ? ". Cancel before then if you don't need it." : "."}`,
        at,
        url: "/finance"
      };
    })
    .filter((alert) => alert.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// Budgets. A month is named by its first local day, "2026-07-01", the way the server stores it.
export type BudgetState = "ok" | "near" | "over";
export type BudgetProgress = { budget: Budget; spent: number; limit: number; ratio: number; state: BudgetState };
export type BudgetThreshold = 80 | 100;
export type BudgetAlert = {
  id: string;
  category: FinanceCategory;
  threshold: BudgetThreshold;
  state: BudgetState;
  spent: number;
  limit: number;
  currency: string;
};

// A typed limit, or null if it is not a positive amount the server accepts. Arabic digits and a decimal comma are fine;
// a comma before exactly three digits ("1,500") is a thousands separator.
export function parseBudgetAmount(text: string) {
  const digits = text
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/٬/g, ",");
  const western = /^\d{1,3}(,\d{3})+$/.test(digits) ? digits.replace(/,/g, "") : digits.replace(/[٫,]/g, ".");
  const value = /^\d+(\.\d+)?$/.test(western) ? Math.round(Number(western) * 100) / 100 : 0;
  return value > 0 && value < 1e10 ? value : null;
}

// The currency most of the spending is in (then bills, then SAR), so one foreign charge doesn't set the currency of new limits.
export function mainCurrency(expenses: Expense[], bills: Bill[]) {
  for (const rows of [expenses, bills]) {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
  }
  return "SAR";
}

export function monthKey(date: Date) {
  return `${localDateKey(date).slice(0, 7)}-01`;
}

export function shiftMonth(month: string, by: number) {
  return monthKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1, 12));
}

// Bills count only once they are logged as expenses, so only expenses are taken in.
// Money is compared in whole cents so 80.00 of 100.00 is "near" however the cents added up.
export function budgetProgress(budgets: Budget[], expenses: Expense[], month: string): BudgetProgress[] {
  const cents = (value: number) => Math.round(Number(value) * 100);
  const spentIn = (budget: Budget) =>
    expenses
      .filter((expense) => expense.category === budget.category && expense.currency === budget.currency && monthKey(new Date(expense.spent_at)) === month)
      .reduce((sum, expense) => sum + cents(expense.amount), 0);

  return budgets
    .filter((budget) => budget.month.slice(0, 10) === month)
    .sort((a, b) => financeCategories.indexOf(a.category) - financeCategories.indexOf(b.category))
    .map((budget) => {
      const spent = spentIn(budget);
      const limit = cents(budget.amount);
      const state: BudgetState = spent >= limit ? "over" : spent * 100 >= limit * 80 ? "near" : "ok";
      return { budget, spent: spent / 100, limit: limit / 100, ratio: spent / limit, state };
    });
}

// "Copy last month": the latest earlier month that has limits, minus categories the target month already has.
export function budgetsToCopy(budgets: Budget[], targetMonth: string): Budget[] {
  const earlier = budgets.filter((budget) => budget.month.slice(0, 10) < targetMonth);
  const latest = earlier.map((budget) => budget.month.slice(0, 10)).sort().at(-1);
  const taken = new Set(budgets.filter((budget) => budget.month.slice(0, 10) === targetMonth).map((budget) => budget.category));
  return earlier.filter((budget) => budget.month.slice(0, 10) === latest && !taken.has(budget.category));
}

// Which alerts have not gone out yet. `fired` is what was remembered ("2026-07-01:food:80"); the new list
// replaces it (ponytail: it only grows, about two keys per category per month). If a load jumps past both thresholds only the 100% alert is sent, but both are remembered.
export function newBudgetAlerts(rows: BudgetProgress[], fired: string[]): { alerts: BudgetAlert[]; fired: string[] } {
  const seen = new Set(fired);
  const alerts: BudgetAlert[] = [];
  for (const { budget, spent, limit, state } of rows) {
    const month = budget.month.slice(0, 10);
    const crossed: BudgetThreshold[] = state === "over" ? [80, 100] : state === "near" ? [80] : [];
    const fresh = crossed.filter((threshold) => !seen.has(`${month}:${budget.category}:${threshold}`));
    for (const threshold of crossed) seen.add(`${month}:${budget.category}:${threshold}`);
    const top = fresh.at(-1);
    if (top) alerts.push({ id: `budget-${month}-${budget.category}-${top}`, category: budget.category, threshold: top, state, spent, limit, currency: budget.currency });
  }
  return { alerts, fired: [...seen] };
}
