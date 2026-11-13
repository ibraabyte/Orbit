import { describe, expect, it } from "vitest";
import { NOTIFICATION_DEFAULT, notificationAllowed, parseNotificationPrefs } from "@/lib/notification-prefs";

describe("notification prefs", () => {
  it("has everything on by default, heads-ups at 9:00", () => {
    const prefs = parseNotificationPrefs(null);
    expect(prefs).toEqual(NOTIFICATION_DEFAULT);
    expect(Object.values(prefs.kinds).every(Boolean)).toBe(true);
    expect(prefs.headsUp).toEqual({ hour: 9, minute: 0 });
  });

  it("keeps the old prayer switch when nothing new was saved", () => {
    expect(parseNotificationPrefs(null, true).kinds.prayer).toBe(false);
    // Once the new screen saved a choice, the old switch no longer counts.
    expect(parseNotificationPrefs(JSON.stringify({ kinds: { prayer: true } }), true).kinds.prayer).toBe(true);
  });

  it("reads a saved choice", () => {
    const raw = JSON.stringify({ kinds: { prayer: true, bills: false, rest: false }, prayers: { fajr: false }, headsUp: { hour: 20, minute: 30 } });
    const prefs = parseNotificationPrefs(raw);
    expect(prefs.kinds.bills).toBe(false);
    expect(prefs.kinds.rest).toBe(false);
    expect(prefs.kinds.reminders).toBe(true);
    expect(prefs.prayers).toEqual({ fajr: false, dhuhr: true, asr: true, maghrib: true, isha: true });
    expect(prefs.headsUp).toEqual({ hour: 20, minute: 30 });
  });

  it("falls back field by field on damaged data, never silencing an alert", () => {
    expect(parseNotificationPrefs("{not json")).toEqual(NOTIFICATION_DEFAULT);
    const prefs = parseNotificationPrefs(JSON.stringify({ kinds: { bills: "no", car: false }, prayers: [], headsUp: { hour: 25, minute: 0 } }));
    expect(prefs.kinds.bills).toBe(true);
    expect(prefs.kinds.car).toBe(false);
    expect(prefs.prayers).toEqual(NOTIFICATION_DEFAULT.prayers);
    expect(prefs.headsUp).toEqual(NOTIFICATION_DEFAULT.headsUp);
  });

  it("goes quiet when the kind or its section is off", () => {
    const prefs = parseNotificationPrefs(JSON.stringify({ kinds: { car: false } }));
    expect(notificationAllowed(prefs, "car")).toBe(false);
    expect(notificationAllowed(prefs, "bills")).toBe(true);
    const financeOff = (key: string) => key !== "finance";
    expect(notificationAllowed(prefs, "bills", financeOff)).toBe(false);
    expect(notificationAllowed(prefs, "budget", financeOff)).toBe(false);
    // Prayer and reminders belong to no section.
    expect(notificationAllowed(prefs, "prayer", () => false)).toBe(true);
    expect(notificationAllowed(prefs, "reminders", () => false)).toBe(true);
  });
});
