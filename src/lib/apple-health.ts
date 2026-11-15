import type { ApiClient } from "@/lib/api";

// Apple Health: the phone reads HealthKit (lib/apple-health-native.ts), adds each local day up here, and sends the
// days to Orbit's server (backend/app/routers/apple_health.py). Shapes mirror its JSON.

export type AppleHealthStatus = { connected: boolean; last_synced_at: string | null };

export type AppleHealthDay = {
  date: string;
  steps: number | null;
  active_kcal: number | null;
  sleep_minutes: number | null;
  workouts: number | null;
  workout_minutes: number | null;
  resting_hr: number | null;
  average_hr: number | null;
  hrv_sdnn: number | null;
  weight_kg: number | null;
};

type Api = Pick<ApiClient, "get" | "put" | "delete">;

export const appleHealthApi = {
  status: (api: Api) => api.get<AppleHealthStatus>("/apple-health/status"),
  days: (api: Api, days = 14) => api.get<AppleHealthDay[]>(`/apple-health/days?days=${days}`),
  save: (api: Api, days: AppleHealthDay[]) => api.put<AppleHealthStatus>("/apple-health/days", { days }),
  disconnect: (api: Api) => api.delete("/apple-health")
};

export type Span = { start: Date; end: Date };

/** Overlapping spans joined into one. Watch, phone and other apps often record the same sleep or workout. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((span) => span.end > span.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      if (span.end > last.end) last.end = span.end;
    } else {
      merged.push({ start: span.start, end: span.end });
    }
  }
  return merged;
}

export function localKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const minutes = (span: Span) => Math.round((span.end.getTime() - span.start.getTime()) / 60000);

/** Minutes asleep per night, keyed by the day you woke up. Sources are merged first, so nothing counts twice. */
export function sleepByDay(asleep: Span[]) {
  const days = new Map<string, number>();
  for (const span of mergeSpans(asleep)) days.set(localKey(span.end), (days.get(localKey(span.end)) ?? 0) + minutes(span));
  return days;
}

/** Workouts and their minutes per day they started, after joining the same workout recorded by two apps. */
export function workoutsByDay(workouts: Span[]) {
  const days = new Map<string, { count: number; minutes: number }>();
  for (const span of mergeSpans(workouts)) {
    const day = days.get(localKey(span.start)) ?? { count: 0, minutes: 0 };
    days.set(localKey(span.start), { count: day.count + 1, minutes: day.minutes + minutes(span) });
  }
  return days;
}

/** A day with no number at all isn't sent: HealthKit returns nothing when access was denied. */
export const hasData = (day: AppleHealthDay) => Object.entries(day).some(([key, value]) => key !== "date" && value !== null);

/** Workout minutes over the last 7 days (today included) from WHOOP and Apple Health together. A day both have is
 * counted once, with the larger number: WHOOP writes its workouts to Health too. */
export function weekMinutes(whoop: { date: string; workout_minutes: number }[], apple: AppleHealthDay[], now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const from = localKey(start);
  const to = localKey(now);
  const byDay = new Map<string, number>();
  for (const [date, value] of [...whoop.map((day) => [day.date, day.workout_minutes] as const), ...apple.map((day) => [day.date, day.workout_minutes ?? 0] as const)]) {
    if (date >= from && date <= to) byDay.set(date, Math.max(byDay.get(date) ?? 0, value || 0));
  }
  return [...byDay.values()].reduce((sum, value) => sum + value, 0);
}

/** The newest day that has this number, or null. */
export function latest<K extends keyof AppleHealthDay>(days: AppleHealthDay[], key: K): { value: NonNullable<AppleHealthDay[K]>; date: string } | null {
  for (let index = days.length - 1; index >= 0; index--) {
    const value = days[index][key];
    if (value !== null && value !== undefined) return { value: value as NonNullable<AppleHealthDay[K]>, date: days[index].date };
  }
  return null;
}
