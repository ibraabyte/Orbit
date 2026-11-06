import { localDateKey } from "@/lib/insights";

// The Friday summary: the week's numbers from the server (no AI), and a written look back with a short plan for the
// coming week from the person's own AI. A week is the seven days that end on a Friday. The limits mirror
// backend/app/services/weekly_summary.py.

export type Money = { currency: string; total: number };
export type WeekFacts = {
  start: string;
  end: string;
  tasks_done: number;
  tasks_overdue: number;
  tasks_next_week: number;
  workouts: number;
  workout_minutes: number;
  workout_target: number | null;
  recovery_avg: number | null;
  sleep_hours_avg: number | null;
  calories_avg: number | null;
  calorie_target: number | null;
  spent: Money[];
  spent_last_week: Money[];
  bills_next_week: number;
  saved: number;
};
export type WeekReply = { facts: WeekFacts; summary: string; plan: string[] };

const FRIDAY = 5;

export const isFriday = (now: Date) => now.getDay() === FRIDAY;

/** The last day of the latest week: today on a Friday, else the Friday before. A local date key, YYYY-MM-DD. */
export function weekEnd(now: Date): string {
  const back = (now.getDay() - FRIDAY + 7) % 7;
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
}

// Under "orbit.cache." so signing out clears it; withdrawing the AI agreement drops it too (lib/ask.ts withdrawKeys).
export const weekCacheKey = (userId: string) => `orbit.cache.week.${userId}`;

const isMoney = (value: unknown): value is Money =>
  Boolean(value) && typeof (value as Money).currency === "string" && typeof (value as Money).total === "number";

/** The saved summary, only for the same week, language and AI, and only if every part is readable. */
export function parseWeekCache(raw: string | null, end: string, locale: string, provider: string): WeekReply | null {
  try {
    const value = JSON.parse(raw ?? "null") as { end?: unknown; locale?: unknown; provider?: unknown; reply?: unknown } | null;
    if (!value || value.end !== end || value.locale !== locale || value.provider !== provider) return null;
    const reply = value.reply as Partial<WeekReply> | undefined;
    if (!reply || typeof reply.summary !== "string" || !reply.summary || !Array.isArray(reply.plan) || !reply.plan.every((item) => typeof item === "string")) return null;
    const facts = reply.facts as WeekFacts | undefined;
    if (!facts || facts.end !== end || !Array.isArray(facts.spent) || !facts.spent.every(isMoney)) return null;
    return reply as WeekReply;
  } catch {
    return null;
  }
}

export const weekCacheValue = (end: string, locale: string, provider: string, reply: WeekReply) => JSON.stringify({ end, locale, provider, reply });

/** Spending against the week before, per currency: +12 means 12% more. null when there is nothing to compare. */
export function spendChange(facts: WeekFacts, currency: string): number | null {
  const now = facts.spent.find((item) => item.currency === currency)?.total ?? 0;
  const before = facts.spent_last_week.find((item) => item.currency === currency)?.total ?? 0;
  return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}
