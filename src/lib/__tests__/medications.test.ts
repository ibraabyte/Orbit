import { describe, expect, it, vi } from "vitest";
import {
  alertIds,
  courseOver,
  daysLeft,
  daysToEnd,
  doseKey,
  doseLog,
  dosesOnDay,
  emptyForm,
  formBody,
  formFrom,
  intervalTimes,
  isLow,
  medicationAlerts,
  medicationsApi,
  parseAlertId,
  parseTime,
  scheduleText,
  stockAlerts,
  takenOn
} from "@/lib/medications";
import type { Medication, MedicationDose } from "@/lib/types";

// Made-up medicines. Tests run in Asia/Riyadh (vitest.config.ts), so these local times are fixed.
function medication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "m1",
    user_id: "u1",
    name: "Zentrol",
    dose: "500 mg",
    schedule: "daily",
    times: ["08:00", "20:00"],
    weekdays: [],
    every_hours: null,
    starts_on: "2026-11-01",
    ends_on: null,
    paused: false,
    stock: null,
    per_dose: 1,
    low_stock_at: null,
    notes: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides
  };
}

function dose(at: Date, overrides: Partial<MedicationDose> = {}): MedicationDose {
  return { id: `d-${at.getTime()}`, user_id: "u1", medication_id: "m1", scheduled_at: at.toISOString(), status: "taken", taken_at: at.toISOString(), created_at: at.toISOString(), updated_at: at.toISOString(), ...overrides };
}

const saturday = new Date(2026, 10, 14); // Saturday 14 Nov 2026
const at = (day: Date, hour: number, minute = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

describe("the schedule", () => {
  it("spells out every few hours from the first time", () => {
    expect(intervalTimes("22:00", 8)).toEqual(["06:00", "14:00", "22:00"]);
    expect(intervalTimes("07:30", 12)).toEqual(["07:30", "19:30"]);
    expect(intervalTimes("00:00", 4)).toHaveLength(6);
  });

  it("is taken inside the course, on its weekdays, and not while paused", () => {
    expect(takenOn(medication(), saturday)).toBe(true);
    expect(takenOn(medication({ starts_on: "2026-11-15" }), saturday)).toBe(false);
    expect(takenOn(medication({ ends_on: "2026-11-14" }), saturday)).toBe(true);
    expect(takenOn(medication({ ends_on: "2026-11-13" }), saturday)).toBe(false);
    expect(takenOn(medication({ paused: true }), saturday)).toBe(false);
    // Saturday is 5 when Monday is 0.
    expect(takenOn(medication({ schedule: "weekdays", weekdays: [5] }), saturday)).toBe(true);
    expect(takenOn(medication({ schedule: "weekdays", weekdays: [0, 2] }), saturday)).toBe(false);
    expect(courseOver(medication({ ends_on: "2026-11-13" }), saturday)).toBe(true);
    expect(daysToEnd(medication({ ends_on: "2026-11-20" }), at(saturday, 23))).toBe(6);
    expect(daysToEnd(medication({ ends_on: "2026-11-14" }), at(saturday, 1))).toBe(0);
  });

  it("knows where each of today's doses stands", () => {
    const now = at(saturday, 21);
    const doses = dosesOnDay([medication(), medication({ id: "m2", name: "Calmira", times: ["21:30"] })], [dose(at(saturday, 8))], saturday, now);
    expect(doses.map((entry) => [entry.medication.name, entry.state])).toEqual([
      ["Zentrol", "taken"],
      ["Zentrol", "due"],
      ["Calmira", "upcoming"]
    ]);
    // Two hours after its time an unanswered dose is missed.
    expect(dosesOnDay([medication()], [], saturday, at(saturday, 22, 30)).map((entry) => entry.state)).toEqual(["missed", "missed"]);
    expect(dosesOnDay([medication()], [dose(at(saturday, 20), { status: "skipped" })], saturday, now)[1].state).toBe("skipped");
  });

  it("logs the past days with what was missed", () => {
    const now = at(saturday, 12);
    const friday = new Date(2026, 10, 13);
    const log = doseLog([medication()], [dose(at(saturday, 8)), dose(at(friday, 8))], now, 2);
    expect(log[0]).toMatchObject({ day: "2026-11-14", due: 1, taken: 1, missed: [] });
    expect(log[1]).toMatchObject({ day: "2026-11-13", due: 2, taken: 1 });
    expect(log[1].missed.map((entry) => entry.at.getHours())).toEqual([20]);
    // Days before the medicine started are left out.
    expect(doseLog([medication({ starts_on: "2026-11-14" })], [], now, 3)).toHaveLength(1);
  });

  it("describes the schedule", () => {
    expect(scheduleText(medication())).toContain("Every day");
    expect(scheduleText(medication({ schedule: "weekdays", weekdays: [4, 0] }))).toMatch(/^Mon, Fri · /);
    expect(scheduleText(medication({ schedule: "interval", every_hours: 8, times: ["06:00", "14:00", "22:00"] }))).toMatch(/^Every 8 hours · /);
  });
});

describe("reminders", () => {
  it("alarms at each coming dose, with a follow-up for the first few", () => {
    const now = at(saturday, 7);
    const alerts = medicationAlerts({ medications: [medication()], doses: [], now, limit: 6, followUps: 2 });
    expect(alerts).toHaveLength(6);
    expect(alerts.slice(0, 4).map((alert) => [alert.id.split("-")[0], alert.at.getHours(), alert.at.getMinutes()])).toEqual([
      ["med", 8, 0],
      ["medlater", 8, 30],
      ["med", 20, 0],
      ["medlater", 20, 30]
    ]);
    expect(alerts[0]).toMatchObject({ title: "Zentrol", body: "500 mg · Time for your dose", url: "/medications", medicationId: "m1", scheduledAt: at(saturday, 8).toISOString() });
    expect(alerts[1].body).toMatch(/^500 mg · Still not marked: the 8:00/);
  });

  it("leaves out answered doses, keeps the follow-up of one that just went off, and skips a snoozed one", () => {
    const now = at(saturday, 8, 10);
    const one = (doses: MedicationDose[], snoozed?: Set<string>) => medicationAlerts({ medications: [medication()], doses, now, limit: 4, followUps: 1, snoozed }).map((alert) => alert.id.split("-")[0] + "@" + alert.at.getHours() + ":" + alert.at.getMinutes());
    expect(one([])).toEqual(["medlater@8:30", "med@20:0", "med@8:0", "med@20:0"]);
    expect(one([dose(at(saturday, 8))])).toEqual(["med@20:0", "medlater@20:30", "med@8:0", "med@20:0"]);
    expect(one([], new Set([doseKey("m1", at(saturday, 8))]))).toEqual(["med@20:0", "medlater@20:30", "med@8:0", "med@20:0"]);
    // Paused or switched off: nothing.
    expect(medicationAlerts({ medications: [medication({ paused: true })], doses: [], now })).toEqual([]);
  });

  it("reads its own alarm ids back", () => {
    const moment = at(saturday, 20);
    const ids = alertIds("4f1c-uuid-1", moment);
    expect(ids.map((id) => parseAlertId(id))).toEqual([
      { kind: "dose", medicationId: "4f1c-uuid-1", at: moment },
      { kind: "followUp", medicationId: "4f1c-uuid-1", at: moment },
      { kind: "snooze", medicationId: "4f1c-uuid-1", at: moment }
    ]);
    expect(parseAlertId("reminder-123")).toBeNull();
    expect(parseAlertId("medstock-m1")).toBeNull();
  });
});

describe("stock", () => {
  it("counts the days left and warns once per running low", () => {
    const row = medication({ stock: 9, per_dose: 1.5, low_stock_at: 10 });
    expect(daysLeft(row)).toBe(3);
    expect(daysLeft(medication({ stock: 6, schedule: "weekdays", weekdays: [0, 3], times: ["08:00"] }))).toBe(21);
    expect(daysLeft(medication())).toBeNull();
    expect(isLow(row)).toBe(true);
    expect(isLow(medication({ stock: 11, low_stock_at: 10 }))).toBe(false);

    const first = stockAlerts([row], []);
    expect(first.alerts.map((item) => item.id)).toEqual(["m1"]);
    expect(first.keep).toEqual(["m1"]);
    expect(stockAlerts([row], first.keep).alerts).toEqual([]);
    // Restocked: forgotten, so the next time it runs low warns again.
    expect(stockAlerts([{ ...row, stock: 60 }], first.keep)).toEqual({ alerts: [], keep: [] });
    // A finished course doesn't warn.
    expect(stockAlerts([{ ...row, ends_on: "2026-11-01" }], [], saturday).alerts).toEqual([]);
  });
});

describe("the form", () => {
  it("reads times typed in either digits", () => {
    expect(parseTime("8")).toBe("08:00");
    expect(parseTime("8:30")).toBe("08:30");
    expect(parseTime("٢١:١٥")).toBe("21:15");
    expect(parseTime("2045")).toBe("20:45");
    expect(parseTime("20.15")).toBe("20:15");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("8pm")).toBeNull();
  });

  it("builds the body, and says what to fix", () => {
    const form = { ...emptyForm(saturday), name: "  Zentrol ", dose: "", times: ["20:00", "08:00"], stock: "٣٠", lowStockAt: "5" };
    const result = formBody(form);
    expect("body" in result && result.body).toMatchObject({ name: "Zentrol", dose: null, times: ["08:00", "20:00"], weekdays: [], every_hours: null, starts_on: "2026-11-14", stock: 30, per_dose: 1, low_stock_at: 5 });
    expect(formBody({ ...form, name: " " })).toEqual({ error: "Type the medication's name" });
    expect(formBody({ ...form, times: [] })).toEqual({ error: "Pick at least one time" });
    expect(formBody({ ...form, schedule: "weekdays" })).toEqual({ error: "Pick at least one day" });
    expect(formBody({ ...form, endsOn: "2026-11-01" })).toEqual({ error: "The course can't end before it starts" });
    expect("error" in formBody({ ...form, stock: "lots" })).toBe(true);
    expect("error" in formBody({ ...form, perDose: "0" })).toBe(true);
    // Every few hours sends the spelled-out times; no stock means no warning.
    const every = formBody({ ...form, schedule: "interval", everyHours: 12, firstTime: "09:00", stock: "" });
    expect("body" in every && every.body).toMatchObject({ times: ["09:00", "21:00"], every_hours: 12, stock: null, low_stock_at: null });
  });

  it("round-trips a saved medicine", () => {
    const row = medication({ schedule: "weekdays", weekdays: [1, 3], stock: 12, low_stock_at: null, ends_on: "2026-11-30" });
    const result = formBody(formFrom(row));
    expect("body" in result && result.body).toMatchObject({ schedule: "weekdays", weekdays: [1, 3], times: ["08:00", "20:00"], stock: 12, low_stock_at: null, ends_on: "2026-11-30", dose: "500 mg" });
  });
});

describe("medicationsApi", () => {
  it("answers a dose for its moment", async () => {
    const api = { get: vi.fn(), post: vi.fn().mockResolvedValue({}), patch: vi.fn(), delete: vi.fn().mockResolvedValue(undefined) };
    await medicationsApi.answer(api, "m1", at(saturday, 8), "skipped");
    expect(api.post).toHaveBeenCalledWith("/medications/m1/doses", { scheduled_at: "2026-11-14T05:00:00.000Z", status: "skipped" });
    await medicationsApi.undo(api, "d1");
    expect(api.delete).toHaveBeenCalledWith("/medications/doses/d1");
  });
});

describe("notification switches", () => {
  it("are on by default and go quiet with the Medications section", async () => {
    const { NOTIFICATION_DEFAULT, notificationAllowed, parseNotificationPrefs } = await import("@/lib/notification-prefs");
    // A choice saved before Medications existed still has its alerts on.
    const old = parseNotificationPrefs(JSON.stringify({ kinds: { prayer: false } }));
    expect(old.kinds.medications && old.kinds.medStock).toBe(true);
    expect(notificationAllowed(NOTIFICATION_DEFAULT, "medications", (key) => key !== "medications")).toBe(false);
    expect(notificationAllowed(NOTIFICATION_DEFAULT, "medStock", () => true)).toBe(true);
  });
});
