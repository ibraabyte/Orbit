import { NINE_AM, type AlertTime } from "@/lib/finance";
import type { PrayerName } from "@/lib/prayer-times";

// Every kind of alert the phone schedules on its own. The morning brief keeps its own setting (lib/morning-brief).
export type NotificationKind = "prayer" | "reminders" | "medications" | "medStock" | "bills" | "installments" | "car" | "budget" | "rest";
export const NOTIFICATION_KINDS: NotificationKind[] = ["prayer", "reminders", "medications", "medStock", "bills", "installments", "car", "budget", "rest"];
export const PRAYER_NAMES: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export type NotificationPrefs = {
  kinds: Record<NotificationKind, boolean>;
  // Which of the five prayers alert, when prayer alerts are on.
  prayers: Record<PrayerName, boolean>;
  // When bill, installment and car heads-ups go out on their day.
  headsUp: AlertTime;
};

export const NOTIFICATION_DEFAULT: NotificationPrefs = {
  kinds: { prayer: true, reminders: true, medications: true, medStock: true, bills: true, installments: true, car: true, budget: true, rest: true },
  prayers: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
  headsUp: NINE_AM
};

// The app section a kind belongs to: when that section is switched off, its alerts go quiet too.
export const NOTIFICATION_SECTION: Record<NotificationKind, string | null> = {
  prayer: null,
  reminders: null,
  medications: "medications",
  medStock: "medications",
  bills: "finance",
  installments: "finance",
  budget: "finance",
  car: "vehicles",
  rest: "exercises"
};

/** On in Notifications, and its section (if any) is not switched off. */
export function notificationAllowed(prefs: NotificationPrefs, kind: NotificationKind, sectionOn: (key: string) => boolean = () => true) {
  const section = NOTIFICATION_SECTION[kind];
  return prefs.kinds[kind] && (section === null || sectionOn(section));
}

const isBool = (value: unknown): value is boolean => typeof value === "boolean";

// Anything unreadable falls back to the default, field by field, so a damaged or older setting never silences an alert.
// legacyPrayerOff: the old single "Prayer alerts" switch, read once when nothing new was saved yet.
export function parseNotificationPrefs(raw: string | null, legacyPrayerOff = false): NotificationPrefs {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") value = parsed as Record<string, unknown>;
  } catch {
    // Default below.
  }
  const kindsIn = (value.kinds ?? {}) as Record<string, unknown>;
  const prayersIn = (value.prayers ?? {}) as Record<string, unknown>;
  const kinds = { ...NOTIFICATION_DEFAULT.kinds };
  if (!raw && legacyPrayerOff) kinds.prayer = false;
  for (const kind of NOTIFICATION_KINDS) if (isBool(kindsIn[kind])) kinds[kind] = kindsIn[kind];
  const prayers = { ...NOTIFICATION_DEFAULT.prayers };
  for (const name of PRAYER_NAMES) if (isBool(prayersIn[name])) prayers[name] = prayersIn[name];
  const time = (value.headsUp ?? {}) as Record<string, unknown>;
  const validTime = Number.isInteger(time.hour) && Number.isInteger(time.minute) && (time.hour as number) >= 0 && (time.hour as number) < 24 && (time.minute as number) >= 0 && (time.minute as number) < 60;
  return { kinds, prayers, headsUp: validTime ? { hour: time.hour as number, minute: time.minute as number } : NOTIFICATION_DEFAULT.headsUp };
}
