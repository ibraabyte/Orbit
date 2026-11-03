import { todaysTasks } from "@/lib/dashboard";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";
import type { Task, TaskPriority } from "@/lib/types";

// What the home-screen widget shows: UI text, task titles and a prayer time, nothing else about the account.
// An empty `count` means there is no data to show, only `message`. Never null: App Group defaults crash the app on one, and JS can't catch it.
export type WidgetProps = {
  rtl: boolean;
  title: string;
  capture: string;
  count: string;
  tasks: string[];
  message: string;
  prayer: string;
  prayerTime: string;
};
export type WidgetEntry = { date: Date; props: WidgetProps };

// The app's language, passed in so this file stays pure.
export type WidgetCopy = {
  arabic: boolean;
  time: (at: Date) => string;
  number: (value: number) => string;
  today: string;
  nothingDue: string;
  openToUpdate: string;
  signedOut: string;
  capture: string;
};

const MAX_TASKS = 3;
const MAX_TITLE = 80;
const FALLBACK_HOURS = 48;
const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

const dueTime = (task: Task) => new Date(task.due_at ?? task.reminder_at ?? 0).getTime();

function noData(message: string, copy: WidgetCopy): WidgetProps {
  return { rtl: copy.arabic, title: copy.today, capture: copy.capture, count: "", tasks: [], message, prayer: "", prayerTime: "" };
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

export const signedOutWidget = (copy: WidgetCopy) => noData(copy.signedOut, copy);

// `hideTitles` is for the app lock: Face ID can't cover the home screen, so a locked app shows only the count there.
export function widgetProps(tasks: Task[], prayers: PrayerTime[], at: Date, copy: WidgetCopy, hideTitles: boolean): WidgetProps {
  const today = todaysTasks(tasks, at).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || dueTime(a) - dueTime(b));
  const next = prayers.find((prayer) => prayer.at.getTime() > at.getTime());
  return {
    ...noData("", copy),
    count: copy.number(today.length),
    tasks: hideTitles ? [] : today.slice(0, MAX_TASKS).map((task) => task.title.slice(0, MAX_TITLE)),
    message: today.length ? "" : copy.nothingDue,
    prayer: next ? (copy.arabic ? next.label : prayerNamesEn[next.name]) : "",
    prayerTime: next ? copy.time(next.at) : ""
  };
}

// The widget changes without the app: the next prayer at each prayer, the day's tasks at midnight.
// ponytail: data is as fresh as the last app open, and once the known prayers run out (about two days) it asks to be opened. Real freshness needs server push.
export function widgetTimeline(tasks: Task[], prayers: PrayerTime[], now: Date, copy: WidgetCopy, hideTitles: boolean): WidgetEntry[] {
  const end = prayers.at(-1)?.at.getTime() ?? now.getTime() + FALLBACK_HOURS * 60 * 60 * 1000;
  const moments = [now.getTime(), ...prayers.map((prayer) => prayer.at.getTime())];
  for (let day = 1; ; day += 1) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day).getTime();
    if (midnight >= end) break;
    moments.push(midnight);
  }
  const entries = [...new Set(moments)]
    .filter((moment) => moment < end)
    .sort((a, b) => a - b)
    .map((moment) => ({ date: new Date(moment), props: widgetProps(tasks, prayers, new Date(moment), copy, hideTitles) }));
  return [...entries, { date: new Date(end), props: noData(copy.openToUpdate, copy) }];
}

type WidgetSync = { loading: boolean; loaded: boolean; tasks: Task[]; prayers: PrayerTime[]; now: Date; copy: WidgetCopy; hideTitles: boolean; lastKey: string };

// What to write, or null to leave the widget alone. Nothing loaded yet is not the same as nothing due,
// and the prayer list is rebuilt every minute, so only a real change may reload the widget.
export function widgetWritePlan({ loading, loaded, tasks, prayers, now, copy, hideTitles, lastKey }: WidgetSync) {
  if (loading || !loaded) return null;
  const entries = widgetTimeline(tasks, prayers, now, copy, hideTitles);
  const key = JSON.stringify(entries.map((entry) => entry.props));
  return key === lastKey ? null : { entries, key };
}
