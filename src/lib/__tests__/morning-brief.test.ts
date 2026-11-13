import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { briefCacheKey, briefPlan, isNoAiError, morningLines, morningNotifications, parseBriefCache, parseMorningSettings, type MorningLabels } from "@/lib/morning-brief";
import type { Bill, DashboardData, Reminder, Task } from "@/lib/types";

// The test zone is Asia/Riyadh (UTC+3): 04:00Z is 07:00 local.
const labels: MorningLabels = {
  title: "Good morning",
  clear: "Nothing due today.",
  tasks: "{n} due today",
  overdue: "{n} overdue",
  reminder: "1 reminder",
  reminders: "{n} reminders",
  bill: "1 bill due",
  bills: "{n} bills due",
  first: "First: {title}"
};
const settings = { enabled: true, hour: 7, minute: 0 };
const now = new Date("2026-11-03T01:00:00.000Z"); // 04:00 local on 3 Nov

const empty = {
  profile: null, tasks: [], taskLists: [], taskSteps: [], reminders: [], captures: [], attachments: [], tags: [], taggings: [], meals: [], mealPlans: [], groceryItems: [],
  weightLogs: [], workouts: [], sleepLogs: [], habits: [], habitLogs: [], medications: [], medicationDoses: [],
  expenses: [], bills: [], budgets: [], cards: [], moneyAccounts: [], investments: [], obligations: [], obligationInstallments: []
} satisfies DashboardData;

const task = (overrides: Partial<Task>): Task => ({
  id: "t1", user_id: "u", title: "Task", notes: null, status: "open", priority: "normal", due_at: null, reminder_at: null, reminder_sent_at: null,
  recurrence: null, list_id: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides
});
const reminder = (overrides: Partial<Reminder>): Reminder => ({
  id: "r1", user_id: "u", task_id: null, title: "Reminder", body: null, remind_at: "2026-11-03T10:00:00Z", status: "scheduled", sent_at: null,
  created_at: "2026-11-01T00:00:00Z", ...overrides
});
const bill = (overrides: Partial<Bill>): Bill => ({
  id: "b1", user_id: "u", name: "Rent", amount: 100, currency: "SAR", category: "bills", due_at: "2026-11-03", recurrence: "monthly", status: "active",
  autopay: false, note: null, card_id: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides
});

describe("morning settings", () => {
  it("defaults to on at 07:00, and ignores anything it cannot read", () => {
    const fallback = { enabled: true, hour: 7, minute: 0 };
    expect(parseMorningSettings(null)).toEqual(fallback);
    expect(parseMorningSettings("not json")).toEqual(fallback);
    expect(parseMorningSettings('{"enabled":"yes","hour":99,"minute":-5}')).toEqual(fallback);
    expect(parseMorningSettings('{"enabled":false,"hour":6,"minute":30}')).toEqual({ enabled: false, hour: 6, minute: 30 });
    expect(parseMorningSettings("null")).toEqual(fallback);
  });
});

describe("brief cache", () => {
  const raw = JSON.stringify({ date: "2026-11-03", locale: "en", provider: "Claude", text: "Two tasks today." });

  it("is per user, and only good for the same day, language and AI", () => {
    expect(briefCacheKey("u1")).toBe("orbit.cache.brief.u1");
    expect(parseBriefCache(raw, "2026-11-03", "en", "Claude")).toBe("Two tasks today.");
    expect(parseBriefCache(raw, "2026-11-04", "en", "Claude")).toBeNull();
    expect(parseBriefCache(raw, "2026-11-03", "ar", "Claude")).toBeNull();
    expect(parseBriefCache(raw, "2026-11-03", "en", "OpenAI")).toBeNull();
  });

  it("is not used when it has no AI recorded (a copy from before the AI was recorded)", () => {
    const old = JSON.stringify({ date: "2026-11-03", locale: "en", text: "Old copy." });
    expect(parseBriefCache(old, "2026-11-03", "en", "Claude")).toBeNull();
  });

  it("treats a missing, broken or empty entry as no cache", () => {
    expect(parseBriefCache(null, "2026-11-03", "en", "Claude")).toBeNull();
    expect(parseBriefCache("{", "2026-11-03", "en", "Claude")).toBeNull();
    expect(parseBriefCache('{"date":"2026-11-03","locale":"en","provider":"Claude","text":""}', "2026-11-03", "en", "Claude")).toBeNull();
    expect(parseBriefCache('{"date":"2026-11-03","locale":"en","provider":"Claude","text":5}', "2026-11-03", "en", "Claude")).toBeNull();
  });
});

describe("when the brief goes to the network", () => {
  const base = { accepted: "Claude" as string | null, cached: null as string | null, force: false, date: "2026-11-03", seen: { day: "2026-11-03", accepted: "Claude" as string | null, status: "ready" as const } };
  const plan = (overrides: Partial<Parameters<typeof briefPlan>[0]> = {}) => briefPlan({ ...base, ...overrides });

  it("makes no call without an agreement, whatever else is true", () => {
    expect(plan({ accepted: null, force: true, seen: null })).toBe("consent");
    expect(plan({ accepted: null, cached: "text" })).toBe("consent");
  });

  it("asks on the first load, after a pull-to-refresh and on a new day", () => {
    expect(plan({ seen: null })).toBe("ask");
    expect(plan({ force: true })).toBe("ask");
    expect(plan({ date: "2026-11-04" })).toBe("ask");
  });

  it("asks when the agreement changed (given again, or for another AI)", () => {
    expect(plan({ seen: { ...base.seen, accepted: null, status: "consent" } })).toBe("ask");
    expect(plan({ seen: { ...base.seen, accepted: "OpenAI", status: "ready" } })).toBe("ask");
  });

  it("shows today's saved brief without a call", () => {
    expect(plan({ cached: "Two tasks today.", seen: null })).toBe("show-cache");
    expect(plan({ cached: "Two tasks today.", date: "2026-11-04" })).toBe("show-cache");
  });

  it("does not ask again on coming back to the screen while a failure stands, a brief is shown or one is being written", () => {
    for (const status of ["error", "ready", "loading"] as const) expect(plan({ seen: { ...base.seen, status } }), status).toBe("keep");
  });

  it("checks again on coming back after 'no AI' or 'not agreed for this AI', which cost no data", () => {
    for (const status of ["no-ai", "consent"] as const) expect(plan({ seen: { ...base.seen, status } }), status).toBe("ask");
  });
});

describe("no-AI error", () => {
  it("is only the server's 'connect your AI' answer", () => {
    expect(isNoAiError(new ApiError(409, "Connect your AI in Integrations first."))).toBe(true);
    expect(isNoAiError(new ApiError(502, "Claude is busy right now."))).toBe(false);
    expect(isNoAiError(new Error("Network request failed"))).toBe(false);
  });
});

describe("morning notifications", () => {
  it("is nothing when switched off", () => {
    expect(morningNotifications(empty, now, { ...settings, enabled: false }, labels)).toEqual([]);
  });

  it("schedules the next four mornings, skipping a time that has passed", () => {
    const early = morningNotifications(empty, now, settings, labels);
    expect(early.map((item) => item.id)).toEqual(["morning-2026-11-03", "morning-2026-11-04", "morning-2026-11-05", "morning-2026-11-06"]);
    expect(early[0].at.toISOString()).toBe("2026-11-03T04:00:00.000Z");
    expect(early[0]).toMatchObject({ title: "Good morning", body: "Nothing due today.", url: "/" });

    const late = morningNotifications(empty, new Date("2026-11-03T05:00:00.000Z"), settings, labels);
    expect(late.map((item) => item.id)).toEqual(["morning-2026-11-04", "morning-2026-11-05", "morning-2026-11-06", "morning-2026-11-07"]);
    // Exactly at the time is already gone.
    expect(morningNotifications(empty, new Date("2026-11-03T04:00:00.000Z"), settings, labels)[0].id).toBe("morning-2026-11-04");
  });

  it("uses the time from settings", () => {
    const [first] = morningNotifications(empty, now, { enabled: true, hour: 6, minute: 30 }, labels);
    expect(first.at.toISOString()).toBe("2026-11-03T03:30:00.000Z");
  });

  it("counts what is due, overdue, reminded and billed on that morning, and names the first task", () => {
    const data = {
      ...empty,
      tasks: [
        task({ id: "a", title: "Call the bank", due_at: "2026-11-03T08:00:00Z" }),
        task({ id: "b", title: "Send report", due_at: "2026-11-03T12:00:00Z" }),
        task({ id: "c", title: "Old thing", due_at: "2026-11-01T08:00:00Z" }),
        task({ id: "d", title: "Done already", status: "done", due_at: "2026-11-03T08:00:00Z" }),
        task({ id: "e", title: "Next week", due_at: "2026-11-10T08:00:00Z" })
      ],
      reminders: [
        reminder({ id: "r1", remind_at: "2026-11-03T10:00:00Z" }),
        reminder({ id: "r2", remind_at: "2026-11-03T11:00:00Z", status: "cancelled" }),
        reminder({ id: "r3", remind_at: "2026-11-04T10:00:00Z" })
      ],
      bills: [bill({ id: "b1" }), bill({ id: "b2", status: "paused" }), bill({ id: "b3", due_at: "2026-11-09" })]
    };
    const [today, tomorrow] = morningNotifications(data, now, settings, labels);
    expect(today.body).toBe("2 due today · 1 overdue · 1 reminder · 1 bill due · First: Call the bank");
    // Tomorrow the same tasks are overdue and today's items have moved on.
    expect(tomorrow.body).toBe("3 overdue · 1 reminder · 1 bill due · First: Old thing");
  });

  it("says many reminders and bills in the plural", () => {
    const data = {
      ...empty,
      reminders: [reminder({ id: "r1" }), reminder({ id: "r2", remind_at: "2026-11-03T11:00:00Z" })],
      bills: [bill({ id: "b1" }), bill({ id: "b2" })]
    };
    expect(morningNotifications(data, now, settings, labels)[0].body).toBe("2 reminders · 2 bills due");
  });

  it("leaves the task title off the lock screen when titles are hidden", () => {
    const data = { ...empty, tasks: [task({ title: "Call the bank", due_at: "2026-11-03T08:00:00Z" })] };
    expect(morningNotifications(data, now, settings, labels, true)[0].body).toBe("1 due today");
  });

  it("names the overdue task first when nothing else is due that day", () => {
    const data = { ...empty, tasks: [task({ title: "Old thing", due_at: "2026-11-01T08:00:00Z" })] };
    expect(morningNotifications(data, now, settings, labels)[0].body).toBe("1 overdue · First: Old thing");
  });
});

describe("morning lines (the card's fallback without AI)", () => {
  it("is empty on a clear day", () => {
    expect(morningLines(empty, now, labels)).toEqual([]);
  });

  it("is the same localized parts the notification joins, one per line", () => {
    const data = {
      ...empty,
      tasks: [task({ title: "Call the bank", due_at: "2026-11-03T08:00:00Z" }), task({ id: "c", title: "Old thing", due_at: "2026-11-01T08:00:00Z" })],
      bills: [bill({})]
    };
    const lines = morningLines(data, new Date("2026-11-03T04:00:00Z"), labels);
    expect(lines).toEqual(["1 due today", "1 overdue", "1 bill due", "First: Call the bank"]);
    expect(morningNotifications(data, now, settings, labels)[0].body).toBe(lines.join(" · "));
  });
});
