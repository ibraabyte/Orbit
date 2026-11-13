import { sectionOn } from "@/lib/app-sections";
import { ApiError } from "@/lib/api";
import { overdueTasks, scheduledReminders, todaysTasks } from "@/lib/dashboard";
import { isToday } from "@/lib/dates";
import { overdueBills, upcomingBills } from "@/lib/finance";
import { digits } from "@/lib/i18n";
import { localDateKey } from "@/lib/insights";
import type { DashboardData } from "@/lib/types";

// The morning brief: a written summary from the server (when an AI is connected), and the phone's own morning alert.

export type MorningSettings = { enabled: boolean; hour: number; minute: number };
export const MORNING_DEFAULT: MorningSettings = { enabled: true, hour: 7, minute: 0 };

// Anything unreadable falls back to the default, so a damaged setting never turns the alert off or breaks Settings.
export function parseMorningSettings(raw: string | null): MorningSettings {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return MORNING_DEFAULT;
    const { enabled, hour, minute } = value as Record<string, unknown>;
    const valid = typeof enabled === "boolean" && Number.isInteger(hour) && Number.isInteger(minute) && (hour as number) >= 0 && (hour as number) < 24 && (minute as number) >= 0 && (minute as number) < 60;
    return valid ? { enabled, hour: hour as number, minute: minute as number } : MORNING_DEFAULT;
  } catch {
    return MORNING_DEFAULT;
  }
}

// Under "orbit.cache." so signing out clears it with the dashboard copy.
export const briefCacheKey = (userId: string) => `orbit.cache.brief.${userId}`;

// The saved brief, only if it is from the same day, language and AI. One saved without its AI is not trusted.
export function parseBriefCache(raw: string | null, date: string, locale: string, provider: string): string | null {
  try {
    const value = JSON.parse(raw ?? "null") as { date?: unknown; locale?: unknown; provider?: unknown; text?: unknown } | null;
    return value && value.date === date && value.locale === locale && value.provider === provider && typeof value.text === "string" && value.text ? value.text : null;
  } catch {
    return null;
  }
}

export type BriefStatus = "loading" | "ready" | "no-ai" | "consent" | "error";
// What the last load saw: the day, the agreement, and what the card ended up showing.
export type BriefSeen = { day: string; accepted: string | null; status: BriefStatus } | null;
export type BriefPlan = "consent" | "show-cache" | "keep" | "ask";

// What a load does. Sending the day to the AI happens on the first load, on a new day, after the agreement changed or on
// a pull-to-refresh or retry (force); returning to the screen only re-checks: a failure stays shown until the person
// retries, and a brief or a write in progress is left alone. "No AI" and "not agreed for this AI" are checked again,
// because they are fixed on other screens and checking sends nothing. No agreement means no call at all.
export function briefPlan({ accepted, cached, force, date, seen }: { accepted: string | null; cached: string | null; force: boolean; date: string; seen: BriefSeen }): BriefPlan {
  if (accepted === null) return "consent";
  if (force) return "ask";
  if (cached) return "show-cache";
  if (!seen || seen.day !== date || seen.accepted !== accepted) return "ask";
  return seen.status === "no-ai" || seen.status === "consent" ? "ask" : "keep";
}

// The server answers 409 only for "no AI connected"; a provider problem is 502.
export const isNoAiError = (error: unknown) => error instanceof ApiError && error.status === 409;

export type MorningLabels = { title: string; clear: string; tasks: string; overdue: string; reminder: string; reminders: string; bill: string; bills: string; first: string };
export type MorningNotification = { id: string; title: string; body: string; at: Date; url: string };

const DAYS_AHEAD = 4;

// ponytail: the text is only as fresh as the last app open, because the project has no push; each of the next four
// mornings is worked out from the data on the phone. The upgrade is server push from the scheduler in backend/app/services/whoop_sync.py.
// hideTitles: the app lock is on, so no task title goes on the lock screen.
export function morningNotifications(data: DashboardData, now: Date, settings: MorningSettings, labels: MorningLabels, hideTitles = false): MorningNotification[] {
  if (!settings.enabled) return [];
  const items: MorningNotification[] = [];
  for (let offset = 0; items.length < DAYS_AHEAD; offset++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, settings.hour, settings.minute);
    if (at.getTime() <= now.getTime()) continue;
    items.push({ id: `morning-${localDateKey(at)}`, title: labels.title, body: morningBody(data, at, labels, hideTitles), at, url: "/" });
  }
  return items;
}

// The day's facts, already in the user's language, one short line each. Empty when there is nothing.
export function morningLines(data: DashboardData, at: Date, labels: MorningLabels, hideTitles = false): string[] {
  const byDue = (a: { due_at: string | null }, b: { due_at: string | null }) => new Date(a.due_at ?? 0).getTime() - new Date(b.due_at ?? 0).getTime();
  const due = todaysTasks(data.tasks, at).sort(byDue);
  const late = overdueTasks(data.tasks, at).sort(byDue);
  const reminders = scheduledReminders(data.reminders, data.tasks).filter((reminder) => isToday(reminder.remind_at, at)).length;
  // A bill is dated at noon, so a one-day window ends at midnight and holds exactly that day's bills.
  // Finance switched off in Settings: its bills are left out of the morning line too.
  const bills = sectionOn(data.profile, "finance") ? overdueBills(data.bills, at).length + upcomingBills(data.bills, 1, at).length : 0;
  const first = due[0] ?? late[0];
  return [
    due.length ? labels.tasks.replace("{n}", digits(due.length)) : null,
    late.length ? labels.overdue.replace("{n}", digits(late.length)) : null,
    reminders === 1 ? labels.reminder : reminders ? labels.reminders.replace("{n}", digits(reminders)) : null,
    bills === 1 ? labels.bill : bills ? labels.bills.replace("{n}", digits(bills)) : null,
    first && !hideTitles ? labels.first.replace("{title}", first.title) : null
  ].filter((line): line is string => Boolean(line));
}

function morningBody(data: DashboardData, at: Date, labels: MorningLabels, hideTitles: boolean) {
  const lines = morningLines(data, at, labels, hideTitles);
  return lines.length ? lines.join(" · ") : labels.clear;
}
