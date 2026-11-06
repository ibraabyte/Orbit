import type { CalendarEvent } from "@/lib/calendar";
import type { PrayerTime } from "@/lib/prayer-times";

// The Today rail: the day as a time line. Prayers are ticks, timed things hang off their time, and "now" is a line.
// A task whose time has passed is not on the rail: it is overdue and sits under the rail instead.

export type RailEntry =
  | { kind: "prayer"; id: string; at: Date; prayer: PrayerTime; past: boolean; next: boolean }
  | { kind: "event"; id: string; at: Date; event: CalendarEvent; past: boolean; taskId: string | null }
  | { kind: "now"; id: "now"; at: Date };

export type Rail = {
  /** Things more than `earlierHours` before now, folded behind one row. */
  earlier: RailEntry[];
  /** The rest of the day, with the now line in its place. */
  entries: RailEntry[];
  /** The next timed thing after now (not a prayer): shown boxed. */
  focusId: string | null;
};

// Shown on the rail. Expenses and weigh-ins are records, not plans; groceries have their own list.
const onRail = new Set<CalendarEvent["kind"]>(["task", "reminder", "meal", "mealPlan", "workout", "sleep", "bill"]);

export function buildRail(events: CalendarEvent[], prayers: PrayerTime[], now = new Date(), earlierHours = 3): Rail {
  const nowMs = now.getTime();
  const nextPrayer = prayers.find((prayer) => prayer.at.getTime() >= nowMs);

  const items: RailEntry[] = [
    ...prayers.map((prayer) => ({ kind: "prayer" as const, id: `prayer-${prayer.name}`, at: prayer.at, prayer, past: prayer.at.getTime() < nowMs, next: prayer === nextPrayer })),
    ...events
      .filter((event) => onRail.has(event.kind))
      // A task's own reminder would put it on the rail twice.
      .filter((event) => !event.id.startsWith("task-reminder-"))
      .map((event) => {
        const at = new Date(event.at);
        const taskId = event.id.startsWith("task-due-") ? event.id.slice("task-due-".length) : null;
        return { kind: "event" as const, id: event.id, at, event, past: at.getTime() < nowMs, taskId };
      })
      .filter((entry) => !(entry.taskId && entry.past))
  ];
  items.push({ kind: "now", id: "now", at: now });
  // Same time: prayer first, then the thing, and now after anything at that very minute.
  const order = { prayer: 0, event: 1, now: 2 } as const;
  items.sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.kind] - order[b.kind]);

  const cutoff = nowMs - earlierHours * 3_600_000;
  const earlier = items.filter((entry) => entry.kind !== "now" && entry.at.getTime() < cutoff);
  const entries = items.filter((entry) => !earlier.includes(entry));
  const focus = entries.find((entry) => entry.kind === "event" && !entry.past);
  return { earlier, entries, focusId: focus?.id ?? null };
}

/** The WHOOP recovery to show as readiness: only today's or yesterday's score, never an old one. */
export function freshRecovery(latest: { value: number; date: string } | null | undefined, now = new Date()) {
  if (!latest) return null;
  const day = (offset: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  return latest.date === day(0) || latest.date === day(-1) ? Math.round(latest.value) : null;
}
