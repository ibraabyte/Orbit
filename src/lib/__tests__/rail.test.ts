import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/calendar";
import type { PrayerTime } from "@/lib/prayer-times";
import { buildRail, freshRecovery } from "@/lib/rail";

const at = (hour: number, minute = 0) => new Date(2026, 10, 5, hour, minute);
const event = (id: string, kind: CalendarEvent["kind"], when: Date): CalendarEvent => ({ id, kind, title: id, detail: "", at: when.toISOString(), href: "/tasks" });
const prayers: PrayerTime[] = [
  { name: "fajr", label: "الفجر", at: at(4, 40) },
  { name: "dhuhr", label: "الظهر", at: at(11, 50) },
  { name: "asr", label: "العصر", at: at(15, 10) },
  { name: "maghrib", label: "المغرب", at: at(17, 30) },
  { name: "isha", label: "العشاء", at: at(19, 0) }
];

describe("buildRail", () => {
  const now = at(14, 0);

  it("puts prayers, timed things and the now line in time order", () => {
    const rail = buildRail([event("meal-1", "meal", at(12, 30)), event("task-due-a", "task", at(16, 0))], prayers, now);
    expect(rail.entries.map((entry) => entry.id)).toEqual(["prayer-dhuhr", "meal-1", "now", "prayer-asr", "task-due-a", "prayer-maghrib", "prayer-isha"]);
    expect(rail.earlier.map((entry) => entry.id)).toEqual(["prayer-fajr"]);
  });

  it("marks the next prayer and boxes the next thing after now", () => {
    const rail = buildRail([event("task-due-a", "task", at(16, 0)), event("reminder-b", "reminder", at(18, 0))], prayers, now);
    const asr = rail.entries.find((entry) => entry.id === "prayer-asr");
    expect(asr?.kind === "prayer" && asr.next).toBe(true);
    expect(rail.focusId).toBe("task-due-a");
  });

  it("leaves passed tasks, task reminders, expenses and weigh-ins off the rail", () => {
    const rail = buildRail(
      [event("task-due-late", "task", at(13, 0)), event("task-reminder-x", "reminder", at(16, 0)), event("expense-1", "expense", at(13, 0)), event("weight-1", "weight", at(15, 0))],
      prayers,
      now
    );
    expect([...rail.earlier, ...rail.entries].some((entry) => entry.kind === "event")).toBe(false);
    expect(rail.focusId).toBeNull();
  });

  it("keeps the task id so the rail can complete it", () => {
    const rail = buildRail([event("task-due-abc", "task", at(16, 0))], prayers, now);
    const task = rail.entries.find((entry) => entry.kind === "event");
    expect(task?.kind === "event" && task.taskId).toBe("abc");
  });
});

describe("freshRecovery", () => {
  const now = at(9, 0);
  it("shows today's or yesterday's recovery, rounded", () => {
    expect(freshRecovery({ value: 71.6, date: "2026-11-05" }, now)).toBe(72);
    expect(freshRecovery({ value: 40, date: "2026-11-04" }, now)).toBe(40);
  });
  it("hides an old or missing score", () => {
    expect(freshRecovery({ value: 80, date: "2026-11-01" }, now)).toBeNull();
    expect(freshRecovery(null, now)).toBeNull();
  });
});
