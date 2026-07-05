import { localDateKey, lastDays, type DailyMetric } from "@/lib/insights";
import type { Bill, BillRecurrence, DashboardData, Expense, FinanceCategory } from "@/lib/types";

export const financeCategories: FinanceCategory[] = [
  "food",
  "transport",
  "fitness",
  "home",
  "subscriptions",
  "shopping",
  "health",
  "travel",
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizeCurrency(currency),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  } catch {
    return `${normalizeCurrency(currency)} ${amount.toFixed(2)}`;
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
      .filter((expense) => expense.spent_at.slice(0, 10) === day.date)
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
    .filter((expense) => expense.spent_at.slice(0, 10) === today)
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

function addMonths(date: Date, months: number) {
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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
