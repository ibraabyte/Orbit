import { describe, expect, it, vi } from "vitest";
import { signedOutWidget, widgetProps, widgetTimeline, widgetWritePlan, writeWidget, type WidgetCopy } from "@/lib/widget-snapshot";
import { prayerTimesFor, RIYADH, type PrayerTime } from "@/lib/prayer-times";
import type { Task } from "@/lib/types";

// The test zone is Asia/Riyadh (UTC+3): 21:00Z is local midnight.
const now = new Date("2026-11-03T06:00:00.000Z"); // 09:00 local on 3 Nov

const english: WidgetCopy = {
  arabic: false,
  time: (at) => `clock-${at.getHours()}`,
  number: String,
  today: "Today",
  nothingDue: "Nothing due today",
  openToUpdate: "Open Orbit to update",
  signedOut: "Sign in to Orbit",
  capture: "Capture"
};
const arabic: WidgetCopy = { ...english, arabic: true, number: (value) => `ar-${value}`, today: "اليوم", nothingDue: "لا شيء اليوم", openToUpdate: "افتح Orbit", signedOut: "سجل الدخول", capture: "التقاط" };

const task = (overrides: Partial<Task>): Task => ({
  id: "t1", user_id: "u", title: "Task", notes: null, status: "open", priority: "normal", due_at: "2026-11-03T12:00:00.000Z", reminder_at: null, reminder_sent_at: null,
  recurrence: null, list_id: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides
});
const prayer = (name: PrayerTime["name"], label: string, at: string): PrayerTime => ({ name, label, at: new Date(at) });
const dhuhr = prayer("dhuhr", "الظهر", "2026-11-03T08:45:00.000Z");
const asr = prayer("asr", "العصر", "2026-11-03T12:00:00.000Z");

describe("widget snapshot", () => {
  it("holds titles and times and nothing else", () => {
    const secret = task({ id: "secret-id", user_id: "secret-user", title: "Call bank", notes: "secret-note" });
    const props = widgetProps([secret], [dhuhr], now, english, false);
    expect(props).toEqual({
      rtl: false,
      title: "Today",
      capture: "Capture",
      count: "1",
      tasks: ["Call bank"],
      message: "",
      prayer: "Dhuhr",
      prayerTime: "clock-11"
    });
    expect(JSON.stringify(props)).not.toContain("secret");
  });

  it("counts today's open tasks only, and lists the most urgent first", () => {
    const tasks = [
      task({ id: "later", title: "Later", due_at: "2026-11-03T15:00:00.000Z" }),
      task({ id: "soon", title: "Soon", due_at: "2026-11-03T07:00:00.000Z" }),
      task({ id: "high", title: "High", priority: "high", due_at: "2026-11-03T16:00:00.000Z" }),
      task({ id: "low", title: "Low", priority: "low", due_at: "2026-11-03T07:00:00.000Z" }),
      task({ id: "extra", title: "Extra", due_at: "2026-11-03T15:30:00.000Z" }),
      task({ id: "done", title: "Done", status: "done" }),
      task({ id: "tomorrow", title: "Tomorrow", due_at: "2026-11-04T07:00:00.000Z" }),
      task({ id: "undated", title: "Undated", due_at: null })
    ];
    const props = widgetProps(tasks, [dhuhr], now, english, false);
    expect(props.count).toBe("5");
    expect(props.tasks).toEqual(["High", "Soon", "Later"]);
  });

  it("keeps a long title small", () => {
    expect(widgetProps([task({ title: "x".repeat(300) })], [], now, english, false).tasks[0]).toHaveLength(80);
  });

  it("says plainly when nothing is due and no prayer is known", () => {
    expect(widgetProps([], [], now, english, false)).toMatchObject({ count: "0", tasks: [], message: "Nothing due today", prayer: "", prayerTime: "" });
  });

  it("follows the app language", () => {
    const props = widgetProps([task({ title: "اتصل" })], [dhuhr], now, arabic, false);
    expect(props).toMatchObject({ rtl: true, title: "اليوم", capture: "التقاط", count: "ar-1", prayer: "الظهر" });
    expect(widgetProps([], [dhuhr], now, arabic, false).message).toBe("لا شيء اليوم");
    expect(widgetProps([], [dhuhr], now, english, false).prayer).toBe("Dhuhr");
  });

  it("names every prayer in English", () => {
    const names = prayerTimesFor(RIYADH, now).map((item) => widgetProps([], [item], new Date(item.at.getTime() - 1), english, false).prayer);
    expect(names).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });

  it("skips a prayer that has passed by the given moment", () => {
    expect(widgetProps([], [dhuhr, asr], new Date("2026-11-03T09:00:00.000Z"), english, false).prayer).toBe("Asr");
  });

  it("carries no account data once signed out, in either language", () => {
    expect(signedOutWidget(english)).toEqual({ rtl: false, title: "Today", capture: "Capture", count: "", tasks: [], message: "Sign in to Orbit", prayer: "", prayerTime: "" });
    expect(signedOutWidget(arabic)).toMatchObject({ rtl: true, message: "سجل الدخول", count: "" });
  });
});

describe("widget timeline", () => {
  const tasks = [task({ title: "Today" }), task({ title: "Tomorrow", due_at: "2026-11-04T12:00:00.000Z" })];
  const fajr = prayer("fajr", "الفجر", "2026-11-04T02:00:00.000Z");

  it("moves on at each prayer and at midnight, in time order", () => {
    const entries = widgetTimeline(tasks, [dhuhr, asr, fajr], now, english, false);
    expect(entries.map((entry) => entry.date.toISOString())).toEqual([
      now.toISOString(),
      dhuhr.at.toISOString(),
      asr.at.toISOString(),
      "2026-11-03T21:00:00.000Z",
      fajr.at.toISOString()
    ]);
    expect(entries.map((entry) => entry.props.prayer)).toEqual(["Dhuhr", "Asr", "Fajr", "Fajr", ""]);
    expect(entries[2].props.tasks).toEqual(["Today"]);
    expect(entries[3].props.tasks).toEqual(["Tomorrow"]);
  });

  it("ends by asking to open the app, not by showing old data", () => {
    const last = widgetTimeline(tasks, [dhuhr, asr, fajr], now, english, false).at(-1)!;
    expect(last.props).toMatchObject({ count: "", tasks: [], message: "Open Orbit to update", prayer: "" });
  });

  it("still ends when no prayers are known", () => {
    const entries = widgetTimeline(tasks, [], now, english, false);
    expect(entries[0].date).toEqual(now);
    expect(entries[0].props.count).toBe("1");
    expect(entries.at(-1)!.date).toEqual(new Date(now.getTime() + 48 * 60 * 60 * 1000));
    expect(entries.at(-1)!.props.message).toBe("Open Orbit to update");
  });
});

describe("with the app lock on", () => {
  const tasks = [task({ title: "Secret title" }), task({ title: "Another secret", due_at: "2026-11-04T12:00:00.000Z" })];

  it("keeps the count, prayer and Capture, and drops the titles", () => {
    expect(widgetProps(tasks, [dhuhr], now, english, true)).toEqual({
      rtl: false, title: "Today", capture: "Capture", count: "1", tasks: [], message: "", prayer: "Dhuhr", prayerTime: "clock-11"
    });
  });

  it("puts no title in any timeline entry", () => {
    const entries = widgetTimeline(tasks, [dhuhr, asr, prayer("fajr", "الفجر", "2026-11-05T02:00:00.000Z")], now, english, true);
    expect(entries.length).toBeGreaterThan(3);
    expect(entries.map((entry) => entry.props.tasks)).toEqual(entries.map(() => []));
    expect(JSON.stringify(entries)).not.toContain("ecret");
    // The second day's task still counts.
    expect(entries.find((entry) => entry.date.getTime() === new Date("2026-11-03T21:00:00.000Z").getTime())?.props.count).toBe("1");
  });

  it("does not claim nothing is due when titles are only hidden", () => {
    expect(widgetProps(tasks, [], now, english, true).message).toBe("");
    expect(widgetProps([], [], now, english, true).message).toBe("Nothing due today");
  });
});

describe("deciding whether to write", () => {
  const base = { loading: false, loaded: true, tasks: [task({ title: "Call" })], prayers: [dhuhr], now, copy: english, hideTitles: false, lastKey: "" };

  it("skips while loading, and while nothing has loaded", () => {
    expect(widgetWritePlan({ ...base, loading: true })).toBeNull();
    expect(widgetWritePlan({ ...base, loaded: false })).toBeNull();
  });

  it("writes the first time, then skips while nothing changed", () => {
    const first = widgetWritePlan(base)!;
    expect(first.entries[0].props.tasks).toEqual(["Call"]);
    const minuteLater = new Date(now.getTime() + 60_000);
    expect(widgetWritePlan({ ...base, now: minuteLater, lastKey: first.key })).toBeNull();
  });

  it("writes again when the tasks or the prayers change", () => {
    const { key } = widgetWritePlan(base)!;
    expect(widgetWritePlan({ ...base, lastKey: key, tasks: [task({ title: "Changed" })] })).not.toBeNull();
    expect(widgetWritePlan({ ...base, lastKey: key, prayers: [asr] })).not.toBeNull();
  });

  it("writes on the next sync when the lock is turned on or off", () => {
    const open = widgetWritePlan(base)!;
    const locked = widgetWritePlan({ ...base, lastKey: open.key, hideTitles: true })!;
    expect(locked.entries.flatMap((entry) => entry.props.tasks)).toEqual([]);
    const reopened = widgetWritePlan({ ...base, lastKey: locked.key })!;
    expect(reopened.entries[0].props.tasks).toEqual(["Call"]);
  });
});

describe("what iOS can store", () => {
  // App Group defaults crash the app on a null, and JS can't catch it.
  it("never puts a null in the props", () => {
    const tasks = [task({})];
    const props = [signedOutWidget(english), ...widgetTimeline(tasks, [], now, english, false), ...widgetTimeline([], [dhuhr], now, arabic, false)].map((item) => ("props" in item ? item.props : item));
    expect(JSON.stringify(props)).not.toContain("null");
  });
});

describe("writing the widget", () => {
  it("does not touch the native module where it isn't allowed, such as Expo Go", () => {
    const load = vi.fn();
    writeWidget(false, load, () => undefined);
    expect(load).not.toHaveBeenCalled();
  });

  it("hands the loaded widget to the update", () => {
    const update = vi.fn();
    writeWidget(true, () => "widget", update);
    expect(update).toHaveBeenCalledWith("widget");
  });

  it("never throws, whether loading or updating fails", () => {
    const fail = () => {
      throw new Error("no native module");
    };
    expect(() => writeWidget(true, fail, () => undefined)).not.toThrow();
    expect(() => writeWidget(true, () => "widget", fail)).not.toThrow();
  });
});
