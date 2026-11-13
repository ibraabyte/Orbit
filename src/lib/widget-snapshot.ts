import { eventHidden, hiddenSections } from "@/lib/app-sections";
import { buildCalendarEvents, type CalendarEvent, type CalendarEventKind } from "@/lib/calendar";
import { openTasks } from "@/lib/dashboard";
import { isPastDue } from "@/lib/dates";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";
import type { DashboardData } from "@/lib/types";

// The home-screen widget is a small Today rail: a "now" line, then what comes next on a time line
// (prayers as ticks, timed things on their time), and how many tasks fell off the rail (overdue).
// It holds UI text, times and titles, nothing else about the account.
// Never null anywhere: App Group defaults crash the app on one, and JS can't catch it.

/** `prayer` and `thing` sit on the rail; `day` marks where tomorrow starts. */
export type WidgetRow = { kind: "prayer" | "thing" | "day"; time: string; title: string; detail: string; next: boolean };

export type WidgetProps = {
  rtl: boolean;
  /** "Today · Thu 6 Nov", shown at the top. */
  title: string;
  now: string;
  capture: string;
  rows: WidgetRow[];
  /** The overdue count, formatted; empty when nothing is overdue. */
  overdue: string;
  overdueLabel: string;
  /** Shown when there are no rows: signed out, nothing known, or "open the app". */
  message: string;
};
export type WidgetEntry = { date: Date; props: WidgetProps };

// The app's language, passed in so this file stays pure.
export type WidgetCopy = {
  arabic: boolean;
  time: (at: Date) => string;
  day: (at: Date) => string;
  number: (value: number) => string;
  today: string;
  now: string;
  tomorrow: string;
  offRail: string;
  nothingAhead: string;
  openToUpdate: string;
  signedOut: string;
  capture: string;
  kinds: Record<CalendarEventKind, string>;
};

/** Enough for the large widget; the small and medium ones show fewer. */
export const MAX_ROWS = 7;
const MAX_TITLE = 80;
const FALLBACK_HOURS = 48;
// Same as the Today rail, minus sleep: a sleep log is dated 09:00 but is about the night before.
const onRail = new Set<CalendarEventKind>(["task", "reminder", "meal", "mealPlan", "workout", "bill"]);

type Planned = { at: Date; event: CalendarEvent };

const startOfDay = (at: Date, plus = 0) => new Date(at.getFullYear(), at.getMonth(), at.getDate() + plus);

function noData(message: string, at: Date, copy: WidgetCopy): WidgetProps {
  return { rtl: copy.arabic, title: `${copy.today} · ${copy.day(at)}`, now: copy.now, capture: copy.capture, rows: [], overdue: "", overdueLabel: copy.offRail, message };
}

// A widget failure must never reach the app.
export function writeWidget<Widget>(allowed: boolean, load: () => Widget, update: (widget: Widget) => void) {
  if (!allowed) return;
  try {
    update(load());
  } catch {
    // The app works the same without a widget.
  }
}

export const signedOutWidget = (copy: WidgetCopy, at = new Date()) => noData(copy.signedOut, at, copy);

/** Timed things that can go on the widget: open tasks, scheduled reminders, meals, workouts, bills. */
export function plannedThings(data: DashboardData): Planned[] {
  const open = { ...data, tasks: openTasks(data.tasks), reminders: data.reminders.filter((reminder) => reminder.status === "scheduled") };
  // Sections switched off in Settings stay off the widget too.
  const hidden = hiddenSections(data.profile);
  return (
    buildCalendarEvents(open)
      .filter((event) => onRail.has(event.kind) && !eventHidden(event.kind, hidden))
      // A task's own reminder would put it on the rail twice.
      .filter((event) => !event.id.startsWith("task-reminder-"))
      .map((event) => ({ at: new Date(event.at), event }))
      .filter((item) => !Number.isNaN(item.at.getTime()))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
  );
}

// `hideTitles` is for the app lock: Face ID can't cover the home screen, so a locked app shows only what kind of thing is next.
export function widgetProps(data: DashboardData, prayers: PrayerTime[], at: Date, copy: WidgetCopy, hideTitles: boolean, things = plannedThings(data)): WidgetProps {
  const atMs = at.getTime();
  // Today and tomorrow only: further out is not "next" any more.
  const until = startOfDay(at, 2).getTime();
  const tomorrow = startOfDay(at, 1).getTime();

  const ahead = [
    ...prayers.filter((prayer) => prayer.at.getTime() > atMs && prayer.at.getTime() < until).map((prayer) => ({ at: prayer.at, prayer, event: null })),
    ...things.filter((item) => item.at.getTime() >= atMs && item.at.getTime() < until).map((item) => ({ at: item.at, prayer: null, event: item.event }))
  ]
    // Same time: prayer first, like the Today rail.
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.prayer ? 0 : 1) - (b.prayer ? 0 : 1))
    .slice(0, MAX_ROWS);

  const rows: WidgetRow[] = [];
  let nextPrayer = true;
  let nextThing = true;
  for (const item of ahead) {
    if (item.at.getTime() >= tomorrow && !rows.some((row) => row.kind === "day")) rows.push({ kind: "day", time: "", title: copy.tomorrow, detail: "", next: false });
    if (item.prayer) {
      rows.push({ kind: "prayer", time: copy.time(item.at), title: copy.arabic ? item.prayer.label : prayerNamesEn[item.prayer.name], detail: "", next: nextPrayer });
      nextPrayer = false;
    } else if (item.event) {
      const kind = copy.kinds[item.event.kind];
      rows.push({ kind: "thing", time: copy.time(item.at), title: hideTitles ? kind : item.event.title.slice(0, MAX_TITLE), detail: hideTitles ? "" : kind, next: nextThing });
      nextThing = false;
    }
  }
  // A day marker with nothing under it would only take space.
  if (rows.at(-1)?.kind === "day") rows.pop();

  // Every open task whose time has passed, as on the Today screen.
  const overdue = openTasks(data.tasks).filter((task) => isPastDue(task.due_at, at)).length;
  return {
    ...noData(rows.length ? "" : copy.nothingAhead, at, copy),
    rows,
    overdue: overdue ? copy.number(overdue) : ""
  };
}

// The widget moves on without the app: at each prayer, at each timed thing, and at midnight.
// ponytail: data is as fresh as the last app open, and once the known prayers run out (about two days) it asks to be opened. Real freshness needs server push.
export function widgetTimeline(data: DashboardData, prayers: PrayerTime[], now: Date, copy: WidgetCopy, hideTitles: boolean): WidgetEntry[] {
  const end = prayers.at(-1)?.at.getTime() ?? now.getTime() + FALLBACK_HOURS * 60 * 60 * 1000;
  const things = plannedThings(data);
  const moments = [now.getTime(), ...prayers.map((prayer) => prayer.at.getTime()), ...things.map((item) => item.at.getTime() + 60_000)];
  for (let day = 1; ; day += 1) {
    const midnight = startOfDay(now, day).getTime();
    if (midnight >= end) break;
    moments.push(midnight);
  }
  const entries = [...new Set(moments)]
    .filter((moment) => moment >= now.getTime() && moment < end)
    .sort((a, b) => a - b)
    .map((moment) => ({ date: new Date(moment), props: widgetProps(data, prayers, new Date(moment), copy, hideTitles, things) }));
  return [...entries, { date: new Date(end), props: noData(copy.openToUpdate, new Date(end), copy) }];
}

type WidgetSync = { loading: boolean; loaded: boolean; data: DashboardData; prayers: PrayerTime[]; now: Date; copy: WidgetCopy; hideTitles: boolean; lastKey: string };

// What to write, or null to leave the widget alone. Nothing loaded yet is not the same as nothing due,
// and the prayer list is rebuilt every minute, so only a real change may reload the widget.
export function widgetWritePlan({ loading, loaded, data, prayers, now, copy, hideTitles, lastKey }: WidgetSync) {
  if (loading || !loaded) return null;
  const entries = widgetTimeline(data, prayers, now, copy, hideTitles);
  const key = JSON.stringify(entries.map((entry) => entry.props));
  return key === lastKey ? null : { entries, key };
}
