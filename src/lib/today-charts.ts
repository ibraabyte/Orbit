import { formatDate, isArabic } from "@/lib/i18n";
import { localDateKey } from "@/lib/insights";
import type { Expense, SleepLog, Workout } from "@/lib/types";

// The last seven days, oldest first, ending today: the bars on Today's charts.
export function lastWeek(now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index, 12));
}

const perDay = <T>(items: T[], at: (item: T) => string, value: (item: T) => number, now: Date) => {
  const keys = lastWeek(now).map(localDateKey);
  const sums = keys.map(() => 0);
  for (const item of items) {
    const index = keys.indexOf(at(item).length === 10 ? at(item) : localDateKey(new Date(at(item))));
    if (index >= 0) sums[index] += value(item);
  }
  return sums;
};

/** Hours slept each night of the week (sleep_date is already a day). */
export const sleepWeek = (logs: SleepLog[], now = new Date()) => perDay(logs, (log) => log.sleep_date.slice(0, 10), (log) => log.duration_minutes / 60, now);
/** Workout minutes each day of the week. */
export const workoutWeek = (workouts: Workout[], now = new Date()) => perDay(workouts, (workout) => workout.logged_at, (workout) => workout.duration_minutes ?? 0, now);
/** Money spent each day of the week, in one currency. */
export const spendWeek = (expenses: Expense[], currency: string, now = new Date()) =>
  perDay(
    expenses.filter((expense) => expense.currency === currency),
    (expense) => expense.spent_at,
    (expense) => Number(expense.amount),
    now
  );

/** The week's running total, day by day: the spending tile's rising bars. */
export const runningTotal = (values: number[]) => values.reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], []);

/** One letter per day under the week's bars. */
export const dayLetters = (now = new Date()) => lastWeek(now).map((day) => formatDate(day, { weekday: "narrow" }));

const en = {
  body: "Your body today",
  recovery: "Recovery",
  sleep: "Sleep",
  hours: "hours",
  spending: "Spending",
  thisWeek: "this week",
  calories: "Calories",
  of: (total: string) => `of ${total}`,
  left: (amount: string) => `${amount} left`,
  workout: "Workout",
  habits: "Habits",
  restOfDay: "Rest of today",
  late: "Late",
  yourDay: "Your day",
  done: (doneCount: number, total: number) => `${doneCount} of ${total} done`,
  now: "Now",
  spendWeek: "This week's spending",
  budgetLeft: (amount: string) => `${amount} left in the budget`,
  ahead: "Coming up",
  inDays: (days: number) => (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`)
};

const ar: typeof en = {
  body: "جسمك اليوم",
  recovery: "التعافي",
  sleep: "النوم",
  hours: "ساعة",
  spending: "المصاريف",
  thisWeek: "هالأسبوع",
  calories: "السعرات",
  of: (total) => `من ${total}`,
  left: (amount) => `باقي ${amount}`,
  workout: "التمرين",
  habits: "العادات",
  restOfDay: "باقي اليوم",
  late: "متأخرة",
  yourDay: "يومك",
  done: (doneCount, total) => `${doneCount} من ${total} خلصت`,
  now: "الحين",
  spendWeek: "مصاريف الأسبوع",
  budgetLeft: (amount) => `باقي ${amount} من الميزانية`,
  ahead: "الجاية",
  inDays: (days) => (days <= 0 ? "اليوم" : days === 1 ? "بكرة" : `بعد ${days} يوم`)
};

export const td = isArabic ? ar : en;
