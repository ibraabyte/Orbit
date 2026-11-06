import { describe, expect, it, vi } from "vitest";
import { plannedThings, signedOutWidget, widgetProps, widgetTimeline, widgetWritePlan, writeWidget, type WidgetCopy } from "@/lib/widget-snapshot";
import { prayerTimesFor, RIYADH, type PrayerTime } from "@/lib/prayer-times";
import type { DashboardData, Meal, MealPlan, Reminder, Task } from "@/lib/types";

// The test zone is Asia/Riyadh (UTC+3): 21:00Z is local midnight.
const now = new Date("2026-11-03T06:00:00.000Z"); // 09:00 local on 3 Nov

const kinds = { task: "Task", reminder: "Reminder", meal: "Meal", mealPlan: "Planned meal", grocery: "Grocery", workout: "Workout", weight: "Weight", sleep: "Sleep", expense: "Expense", bill: "Bill" };
const english: WidgetCopy = {
  arabic: false,
  time: (at) => `${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}`,
  day: (at) => `day-${at.getDate()}`,
  number: String,
  today: "Today",
  now: "Now",
  tomorrow: "Tomorrow",
  offRail: "Off the rail",
  nothingAhead: "Nothing timed ahead.",
  openToUpdate: "Open Orbit to update",
  signedOut: "Sign in to Orbit",
  capture: "Capture",
  kinds
};
const arabic: WidgetCopy = { ...english, arabic: true, number: (value) => `ar-${value}`, today: "اليوم", now: "الآن", tomorrow: "بكرة", nothingAhead: "ما فيه شي", openToUpdate: "افتح Orbit", signedOut: "سجل الدخول", capture: "التقاط", kinds: { ...kinds, task: "مهمة" } };

const empty = {
  profile: null,
  ...Object.fromEntries(
    ["tasks", "taskLists", "taskSteps", "reminders", "captures", "attachments", "tags", "taggings", "meals", "mealPlans", "groceryItems", "people", "weightLogs", "workouts", "sleepLogs", "focusSessions", "habits", "habitLogs", "goals", "goalMilestones", "journalEntries", "expenses", "bills", "budgets", "cards", "moneyAccounts", "investments", "obligations", "obligationInstallments"].map((key) => [key, []])
  )
} as unknown as DashboardData;
const withData = (overrides: Partial<DashboardData>): DashboardData => ({ ...empty, ...overrides });

const task = (overrides: Partial<Task>): Task => ({
  id: "t1", user_id: "u", title: "Task", notes: null, status: "open", priority: "normal", due_at: "2026-11-03T12:00:00.000Z", reminder_at: null, reminder_sent_at: null,
  recurrence: null, list_id: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides
});
const reminder = (overrides: Partial<Reminder>): Reminder => ({ id: "r1", user_id: "u", task_id: null, title: "Reminder", body: null, remind_at: "2026-11-03T10:00:00.000Z", status: "scheduled", sent_at: null, created_at: "2026-11-01T00:00:00Z", ...overrides });
const meal = (overrides: Partial<Meal>): Meal => ({ id: "m1", user_id: "u", name: "Meal", calories: 500, protein_g: null, carbs_g: null, fat_g: null, logged_at: "2026-11-03T05:00:00.000Z", created_at: "2026-11-01T00:00:00Z", ...overrides });
const plan = (overrides: Partial<MealPlan>): MealPlan => ({ id: "p1", user_id: "u", name: "Kabsa", plan_date: "2026-11-03", meal_type: "lunch", calories: 700, protein_g: null, carbs_g: null, fat_g: null, note: null, status: "planned", created_at: "2026-11-01T00:00:00Z", ...overrides } as MealPlan);
const prayer = (name: PrayerTime["name"], label: string, at: string): PrayerTime => ({ name, label, at: new Date(at) });
const dhuhr = prayer("dhuhr", "الظهر", "2026-11-03T08:45:00.000Z"); // 11:45 local
const asr = prayer("asr", "العصر", "2026-11-03T12:00:00.000Z"); // 15:00 local
const fajr = prayer("fajr", "الفجر", "2026-11-04T02:00:00.000Z"); // 05:00 local, tomorrow

describe("the widget rail", () => {
  it("lists what comes next in time order, with the next prayer and the next thing marked", () => {
    const data = withData({
      tasks: [task({ id: "a", title: "Call bank", due_at: "2026-11-03T10:30:00.000Z" })],
      mealPlans: [plan({})] // 12:00 local
    });
    const props = widgetProps(data, [dhuhr, asr], now, english, false);
    expect(props.rows).toEqual([
      { kind: "prayer", time: "11:45", title: "Dhuhr", detail: "", next: true },
      { kind: "thing", time: "12:00", title: "Kabsa", detail: "Planned meal", next: true },
      { kind: "thing", time: "13:30", title: "Call bank", detail: "Task", next: false },
      { kind: "prayer", time: "15:00", title: "Asr", detail: "", next: false }
    ]);
    expect(props).toMatchObject({ rtl: false, title: "Today · day-3", now: "Now", capture: "Capture", overdue: "", message: "" });
  });

  it("holds titles, times and kinds and nothing else", () => {
    const secret = task({ id: "secret-id", user_id: "secret-user", title: "Call bank", notes: "secret-note" });
    expect(JSON.stringify(widgetProps(withData({ tasks: [secret] }), [dhuhr], now, english, false))).not.toContain("secret");
  });

  it("leaves out what has passed, done tasks, sent reminders, and a task's own reminder", () => {
    const data = withData({
      tasks: [
        task({ id: "past", title: "Past", due_at: "2026-11-03T05:00:00.000Z" }),
        task({ id: "done", title: "Done", status: "done" }),
        task({ id: "own", title: "Own", reminder_at: "2026-11-03T07:00:00.000Z" })
      ],
      reminders: [reminder({ title: "Sent", status: "sent" }), reminder({ id: "r2", title: "Ping" })],
      meals: [meal({ name: "Breakfast" })]
    });
    expect(widgetProps(data, [], now, english, false).rows.map((row) => row.title)).toEqual(["Ping", "Own"]);
  });

  it("marks where tomorrow starts, and stops at the end of tomorrow", () => {
    const evening = new Date("2026-11-03T19:00:00.000Z"); // 22:00 local
    const data = withData({ tasks: [task({ title: "Gym", due_at: "2026-11-04T04:00:00.000Z" }), task({ id: "far", title: "Far", due_at: "2026-11-06T04:00:00.000Z" })] });
    const rows = widgetProps(data, [fajr], evening, english, false).rows;
    expect(rows.map((row) => `${row.kind}:${row.title}`)).toEqual(["day:Tomorrow", "prayer:Fajr", "thing:Gym"]);
  });

  it("keeps to seven rows", () => {
    const tasks = Array.from({ length: 12 }, (_, index) => task({ id: `t${index}`, title: `T${index}`, due_at: new Date(now.getTime() + (index + 1) * 600_000).toISOString() }));
    expect(widgetProps(withData({ tasks }), [], now, english, false).rows).toHaveLength(7);
  });

  it("keeps a long title small", () => {
    expect(widgetProps(withData({ tasks: [task({ title: "x".repeat(300) })] }), [], now, english, false).rows[0].title).toHaveLength(80);
  });

  it("counts every open task whose time has passed as off the rail", () => {
    const data = withData({
      tasks: [task({ id: "a", due_at: "2026-11-03T05:00:00.000Z" }), task({ id: "b", due_at: "2026-10-30T05:00:00.000Z" }), task({ id: "c", due_at: "2026-11-01T05:00:00.000Z", status: "done" }), task({ id: "d" })]
    });
    expect(widgetProps(data, [], now, english, false).overdue).toBe("2");
    expect(widgetProps(data, [], now, arabic, false).overdue).toBe("ar-2");
  });

  it("says plainly when nothing is ahead", () => {
    expect(widgetProps(empty, [], now, english, false)).toMatchObject({ rows: [], overdue: "", message: "Nothing timed ahead." });
  });

  it("follows the app language", () => {
    const props = widgetProps(withData({ tasks: [task({ title: "اتصل" })] }), [dhuhr], now, arabic, false);
    expect(props).toMatchObject({ rtl: true, title: "اليوم · day-3", now: "الآن", capture: "التقاط" });
    expect(props.rows.map((row) => row.title)).toEqual(["الظهر", "اتصل"]);
    expect(props.rows[1].detail).toBe("مهمة");
  });

  it("names every prayer in English", () => {
    const names = prayerTimesFor(RIYADH, now).map((item) => widgetProps(empty, [item], new Date(item.at.getTime() - 1), english, false).rows[0].title);
    expect(names).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });

  it("carries no account data once signed out, in either language", () => {
    expect(signedOutWidget(english, now)).toEqual({ rtl: false, title: "Today · day-3", now: "Now", capture: "Capture", rows: [], overdue: "", overdueLabel: "Off the rail", message: "Sign in to Orbit" });
    expect(signedOutWidget(arabic, now)).toMatchObject({ rtl: true, message: "سجل الدخول", rows: [] });
  });

  it("finds timed things from the dashboard", () => {
    const things = plannedThings(withData({ tasks: [task({ due_at: null })], mealPlans: [plan({ status: "skipped" }), plan({ id: "p2", name: "Salad" })] }));
    expect(things.map((item) => item.event.title)).toEqual(["Salad"]);
  });
});

describe("widget timeline", () => {
  const data = withData({ tasks: [task({ title: "Today" }), task({ id: "t2", title: "Tomorrow", due_at: "2026-11-04T12:00:00.000Z" })] });

  it("moves on at each prayer, a minute after each thing, and at midnight, in time order", () => {
    const entries = widgetTimeline(data, [dhuhr, asr, fajr], now, english, false);
    expect(entries.map((entry) => entry.date.toISOString())).toEqual([
      now.toISOString(),
      dhuhr.at.toISOString(),
      asr.at.toISOString(),
      "2026-11-03T12:01:00.000Z",
      "2026-11-03T21:00:00.000Z",
      fajr.at.toISOString()
    ]);
    // At Asr the task at the same minute is still "next"; a minute later it is overdue.
    expect(entries[2].props.rows[0]).toMatchObject({ kind: "thing", title: "Today" });
    expect(entries[3].props.overdue).toBe("1");
    expect(entries[3].props.rows.some((row) => row.title === "Today")).toBe(false);
    expect(entries[4].props.title).toBe("Today · day-4");
  });

  it("ends by asking to open the app, not by showing old data", () => {
    const last = widgetTimeline(data, [dhuhr, asr, fajr], now, english, false).at(-1)!;
    expect(last.props).toMatchObject({ rows: [], overdue: "", message: "Open Orbit to update" });
  });

  it("still ends when no prayers are known", () => {
    const entries = widgetTimeline(data, [], now, english, false);
    expect(entries[0].date).toEqual(now);
    expect(entries[0].props.rows[0].title).toBe("Today");
    expect(entries.at(-1)!.date).toEqual(new Date(now.getTime() + 48 * 60 * 60 * 1000));
    expect(entries.at(-1)!.props.message).toBe("Open Orbit to update");
  });
});

describe("with the app lock on", () => {
  const data = withData({ tasks: [task({ title: "Secret title" }), task({ id: "t2", title: "Another secret", due_at: "2026-11-04T12:00:00.000Z" })] });

  it("keeps the times, prayers and overdue count, and shows only the kind of each thing", () => {
    const rows = widgetProps(data, [dhuhr], now, english, true).rows;
    expect(rows).toEqual([
      { kind: "prayer", time: "11:45", title: "Dhuhr", detail: "", next: true },
      { kind: "thing", time: "15:00", title: "Task", detail: "", next: true },
      { kind: "day", time: "", title: "Tomorrow", detail: "", next: false },
      { kind: "thing", time: "15:00", title: "Task", detail: "", next: false }
    ]);
  });

  it("puts no title in any timeline entry", () => {
    const entries = widgetTimeline(data, [dhuhr, asr, fajr], now, english, true);
    expect(entries.length).toBeGreaterThan(3);
    expect(JSON.stringify(entries)).not.toContain("ecret");
  });
});

describe("deciding whether to write", () => {
  const base = { loading: false, loaded: true, data: withData({ tasks: [task({ title: "Call" })] }), prayers: [dhuhr], now, copy: english, hideTitles: false, lastKey: "" };
  const titles = (plan: NonNullable<ReturnType<typeof widgetWritePlan>>) => plan.entries[0].props.rows.filter((row) => row.kind === "thing").map((row) => row.title);

  it("skips while loading, and while nothing has loaded", () => {
    expect(widgetWritePlan({ ...base, loading: true })).toBeNull();
    expect(widgetWritePlan({ ...base, loaded: false })).toBeNull();
  });

  it("writes the first time, then skips while nothing changed", () => {
    const first = widgetWritePlan(base)!;
    expect(titles(first)).toEqual(["Call"]);
    const minuteLater = new Date(now.getTime() + 60_000);
    expect(widgetWritePlan({ ...base, now: minuteLater, lastKey: first.key })).toBeNull();
  });

  it("writes again when the tasks or the prayers change", () => {
    const { key } = widgetWritePlan(base)!;
    expect(widgetWritePlan({ ...base, lastKey: key, data: withData({ tasks: [task({ title: "Changed" })] }) })).not.toBeNull();
    expect(widgetWritePlan({ ...base, lastKey: key, prayers: [asr] })).not.toBeNull();
  });

  it("writes on the next sync when the lock is turned on or off", () => {
    const open = widgetWritePlan(base)!;
    const locked = widgetWritePlan({ ...base, lastKey: open.key, hideTitles: true })!;
    expect(JSON.stringify(locked.entries)).not.toContain("Call");
    const reopened = widgetWritePlan({ ...base, lastKey: locked.key })!;
    expect(titles(reopened)).toEqual(["Call"]);
  });
});

describe("what iOS can store", () => {
  // App Group defaults crash the app on a null, and JS can't catch it.
  it("never puts a null in the props", () => {
    const data = withData({ tasks: [task({})], mealPlans: [plan({ note: null })], reminders: [reminder({})] });
    const props = [signedOutWidget(english), ...widgetTimeline(data, [], now, english, false), ...widgetTimeline(data, [dhuhr, fajr], now, arabic, true)].map((item) => ("props" in item ? item.props : item));
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
