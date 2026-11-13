import type { ApiClient } from "@/lib/api";
import { digits, formatClock, formatDate, isArabic } from "@/lib/i18n";
import type { Medication, MedicationDose, MedicationSchedule } from "@/lib/types";

// Medications: the schedule is worked out on the phone, from the medicine's times on the phone's own clock, so
// reminders go off without a connection. Only answered doses are stored (taken or skipped); a dose whose moment has
// passed with no answer is missed. Shapes mirror backend/app/routers/medications.py.

export const SCHEDULES: MedicationSchedule[] = ["daily", "weekdays", "interval"];
// Every few hours: steps that fit a day evenly, so the times are the same each day (the server also takes 2 and 3).
export const INTERVAL_HOURS = [4, 6, 8, 12] as const;
// Quick picks for a time; any other is typed.
export const COMMON_TIMES = ["07:00", "08:00", "09:00", "12:00", "14:00", "18:00", "20:00", "22:00"];
// A second nudge when a dose is still not answered, so "remind me later" works even if the app never wakes.
export const FOLLOW_UP_MINUTES = 30;
// "Remind me later" pressed while the app can act: once more after this long.
export const SNOOZE_MINUTES = 15;
// Until then a passed dose is still "due now"; after it, missed.
export const DUE_WINDOW_MINUTES = 120;

const MINUTE = 60_000;
const DAY = 86_400_000;

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;
export type MedicationInput = Omit<Medication, "id" | "user_id" | "created_at" | "updated_at">;

export const medicationsApi = {
  add: (api: Api, body: MedicationInput) => api.post<Medication>("/medications", body),
  update: (api: Api, id: string, body: Partial<MedicationInput>) => api.patch<Medication>(`/medications/${encodeURIComponent(id)}`, body),
  remove: (api: Api, id: string) => api.delete(`/medications/${encodeURIComponent(id)}`),
  answer: (api: Api, medicationId: string, scheduledAt: Date, status: MedicationDose["status"] = "taken") =>
    api.post<{ dose: MedicationDose; medication: Medication }>(`/medications/${encodeURIComponent(medicationId)}/doses`, { scheduled_at: scheduledAt.toISOString(), status }),
  undo: (api: Api, doseId: string) => api.delete(`/medications/doses/${encodeURIComponent(doseId)}`)
};

/** Monday 0 … Sunday 6, as the server counts them. */
export const weekdayOf = (date: Date) => (date.getDay() + 6) % 7;

/** "2026-11-14" on the phone's own calendar. */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The times of "every N hours from the first": 22:00 every 8 → 06:00, 14:00, 22:00. */
export function intervalTimes(first: string, everyHours: number) {
  const [hour, minute] = first.split(":").map(Number);
  const count = Math.max(1, Math.floor(24 / everyHours));
  return Array.from({ length: count }, (_, index) => `${String((hour + index * everyHours) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`).sort();
}

/** True on a day the medicine is taken: not paused, inside its course, and on one of its weekdays. */
export function takenOn(medication: Medication, day: Date) {
  const key = dayKey(day);
  if (medication.paused || key < medication.starts_on || (medication.ends_on && key > medication.ends_on)) return false;
  return medication.schedule !== "weekdays" || medication.weekdays.includes(weekdayOf(day));
}

/** The course is over (its last day has passed). */
export const courseOver = (medication: Medication, now = new Date()) => Boolean(medication.ends_on && medication.ends_on < dayKey(now));

/** The moments it is due on one day. */
export function momentsOn(medication: Medication, day: Date): Date[] {
  if (!takenOn(medication, day)) return [];
  return medication.times.map((time) => {
    const [hour, minute] = time.split(":").map(Number);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  });
}

export type DoseState = "taken" | "skipped" | "upcoming" | "due" | "missed";

export type ScheduledDose = {
  /** The medicine and the moment, e.g. "id@1763096400000". */
  key: string;
  medication: Medication;
  at: Date;
  dose: MedicationDose | null;
  state: DoseState;
};

export const doseKey = (medicationId: string, at: Date | number) => `${medicationId}@${typeof at === "number" ? at : at.getTime()}`;

function answered(doses: MedicationDose[]) {
  const byKey = new Map<string, MedicationDose>();
  for (const dose of doses) byKey.set(doseKey(dose.medication_id, Date.parse(dose.scheduled_at)), dose);
  return byKey;
}

function stateOf(at: Date, dose: MedicationDose | null, now: Date): DoseState {
  if (dose) return dose.status;
  if (at.getTime() > now.getTime()) return "upcoming";
  return now.getTime() - at.getTime() <= DUE_WINDOW_MINUTES * MINUTE ? "due" : "missed";
}

/** Every dose of one day, earliest first, each with its answer and where it stands now. */
export function dosesOnDay(medications: Medication[], doses: MedicationDose[], day: Date, now = new Date()): ScheduledDose[] {
  const byKey = answered(doses);
  return medications
    .flatMap((medication) =>
      momentsOn(medication, day).map((at) => {
        const key = doseKey(medication.id, at);
        const dose = byKey.get(key) ?? null;
        return { key, medication, at, dose, state: stateOf(at, dose, now) };
      })
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.medication.name.localeCompare(b.medication.name));
}

export type DayLog = { day: string; due: number; taken: number; skipped: number; missed: ScheduledDose[] };

/** The last few days, today first: how many doses were due by now, taken, skipped, and which were missed. */
export function doseLog(medications: Medication[], doses: MedicationDose[], now = new Date(), days = 7): DayLog[] {
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(now, -index);
    const passed = dosesOnDay(medications, doses, day, now).filter((entry) => entry.state !== "upcoming" && entry.state !== "due");
    return {
      day: dayKey(day),
      due: passed.length,
      taken: passed.filter((entry) => entry.state === "taken").length,
      skipped: passed.filter((entry) => entry.state === "skipped").length,
      missed: passed.filter((entry) => entry.state === "missed")
    };
  }).filter((log) => log.due > 0);
}

// ---- Reminders ----

export type MedicationAlert = {
  id: string;
  title: string;
  body: string;
  at: Date;
  url: string;
  medicationId: string;
  scheduledAt: string;
};

export const ALERT_PREFIX = { dose: "med-", followUp: "medlater-", snooze: "medsnooze-" } as const;
const alertSuffix = (medicationId: string, at: Date) => `${medicationId}-${Math.round(at.getTime() / MINUTE)}`;
export const alertIds = (medicationId: string, at: Date) => Object.values(ALERT_PREFIX).map((prefix) => prefix + alertSuffix(medicationId, at));

const doseLine = (medication: Medication) => (medication.dose ? `${medication.dose} · ` : "");

/** One alert's words and where it opens. */
export function doseAlert(kind: keyof typeof ALERT_PREFIX, medication: Medication, scheduledAt: Date, at: Date): MedicationAlert {
  return {
    id: ALERT_PREFIX[kind] + alertSuffix(medication.id, scheduledAt),
    title: medication.name,
    body: doseLine(medication) + (kind === "dose" ? rx.alertNow : rx.alertStill(formatClock(scheduledAt))),
    at,
    url: "/medications",
    medicationId: medication.id,
    scheduledAt: scheduledAt.toISOString()
  };
}

/**
 * What the phone should alarm for next: each coming dose at its time, plus a follow-up FOLLOW_UP_MINUTES later for
 * the first few, while unanswered. iOS keeps at most 64 pending alarms, so this keeps `limit` of them and the app
 * reschedules on every load (and every "taken" opens the app). `snoozed`: doses with a "later" alarm already set, so
 * their follow-up is not added twice.
 */
export function medicationAlerts({
  medications,
  doses,
  now = new Date(),
  limit = 12,
  followUps = 3,
  horizonDays = 4,
  snoozed = new Set<string>()
}: {
  medications: Medication[];
  doses: MedicationDose[];
  now?: Date;
  limit?: number;
  followUps?: number;
  horizonDays?: number;
  snoozed?: Set<string>;
}): MedicationAlert[] {
  const open = Array.from({ length: horizonDays + 1 }, (_, index) => dosesOnDay(medications, doses, addDays(startOfDay(now), index), now))
    .flat()
    .filter((entry) => !entry.dose && entry.at.getTime() + FOLLOW_UP_MINUTES * MINUTE > now.getTime());
  const later = open
    .filter((entry) => !snoozed.has(entry.key))
    .slice(0, followUps)
    .map((entry) => doseAlert("followUp", entry.medication, entry.at, new Date(entry.at.getTime() + FOLLOW_UP_MINUTES * MINUTE)));
  const first = open.filter((entry) => entry.at.getTime() > now.getTime()).map((entry) => doseAlert("dose", entry.medication, entry.at, entry.at));
  return [...later, ...first.slice(0, Math.max(0, limit - later.length))].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Parses an alert id back into the medicine and the moment, or null for someone else's alert. */
export function parseAlertId(id: string): { kind: keyof typeof ALERT_PREFIX; medicationId: string; at: Date } | null {
  const match = /^(med|medlater|medsnooze)-(.+)-(\d+)$/.exec(id);
  if (!match) return null;
  const kind = match[1] === "med" ? "dose" : match[1] === "medlater" ? "followUp" : "snooze";
  return { kind, medicationId: match[2], at: new Date(Number(match[3]) * MINUTE) };
}

// ---- Stock ----

/** Doses taken in an average day: every time, on every day or on its weekdays. */
export function dosesPerDay(medication: Medication) {
  const days = medication.schedule === "weekdays" ? medication.weekdays.length / 7 : 1;
  return medication.times.length * days;
}

/** About how many days the stock lasts, or null when it isn't counted. */
export function daysLeft(medication: Medication) {
  if (medication.stock === null) return null;
  const perDay = dosesPerDay(medication) * medication.per_dose;
  return perDay > 0 ? Math.floor(medication.stock / perDay) : null;
}

export const isLow = (medication: Medication) => medication.stock !== null && medication.low_stock_at !== null && medication.stock <= medication.low_stock_at;

/**
 * Low-stock warnings to send now: medicines at or under their mark that were not warned about yet. `warned` is what
 * went out before; the list to keep drops a medicine once it is restocked, so the next time it runs low warns again.
 */
export function stockAlerts(medications: Medication[], warned: string[], now = new Date()) {
  const low = medications.filter((medication) => isLow(medication) && !courseOver(medication, now));
  const lowIds = new Set(low.map((medication) => medication.id));
  return { alerts: low.filter((medication) => !warned.includes(medication.id)), keep: warned.filter((id) => lowIds.has(id)).concat(low.filter((medication) => !warned.includes(medication.id)).map((medication) => medication.id)) };
}

// ---- The form ----

export type MedicationForm = {
  name: string;
  dose: string;
  schedule: MedicationSchedule;
  times: string[];
  weekdays: number[];
  everyHours: number;
  firstTime: string;
  startsOn: string;
  endsOn: string | null;
  paused: boolean;
  stock: string;
  perDose: string;
  lowStock: boolean;
  lowStockAt: string;
  notes: string;
};

export function emptyForm(today = new Date()): MedicationForm {
  return { name: "", dose: "", schedule: "daily", times: ["08:00"], weekdays: [], everyHours: 8, firstTime: "08:00", startsOn: dayKey(today), endsOn: null, paused: false, stock: "", perDose: "1", lowStock: true, lowStockAt: "5", notes: "" };
}

const text = (value: number | null) => (value === null ? "" : String(value));

export function formFrom(medication: Medication): MedicationForm {
  return {
    name: medication.name,
    dose: medication.dose ?? "",
    schedule: medication.schedule,
    times: medication.times,
    weekdays: medication.weekdays,
    everyHours: medication.every_hours ?? 8,
    firstTime: medication.times[0] ?? "08:00",
    startsOn: medication.starts_on,
    endsOn: medication.ends_on,
    paused: medication.paused,
    stock: text(medication.stock),
    perDose: String(medication.per_dose),
    lowStock: medication.low_stock_at !== null,
    lowStockAt: medication.low_stock_at === null ? "5" : String(medication.low_stock_at),
    notes: medication.notes ?? ""
  };
}

export function toLatinDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** "8", "8:30", "20.15", "٨:٣٠", "0830" → "08:30" on a 24-hour clock; null when it isn't a time. */
export function parseTime(raw: string): string | null {
  const value = toLatinDigits(raw).trim().replace(/[.٫]/g, ":");
  const match = /^(\d{1,2})(?::?(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function amount(raw: string): number | null | undefined {
  const value = toLatinDigits(raw).trim().replace("٫", ".").replace(",", ".");
  if (!value) return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return undefined;
  return Number(value);
}

/** The form as the POST/PATCH body, or what to fix. */
export function formBody(form: MedicationForm): { body: MedicationInput } | { error: string } {
  const name = form.name.trim();
  if (!name) return { error: rx.needName };
  const times = form.schedule === "interval" ? intervalTimes(form.firstTime, form.everyHours) : [...new Set(form.times)].sort();
  if (!times.length) return { error: rx.needTime };
  if (form.schedule === "weekdays" && !form.weekdays.length) return { error: rx.needDay };
  if (form.endsOn && form.endsOn < form.startsOn) return { error: rx.endBeforeStart };
  const stock = amount(form.stock);
  const perDose = amount(form.perDose);
  const lowAt = form.lowStock ? amount(form.lowStockAt) : null;
  if (stock === undefined || (stock !== null && stock >= 100000)) return { error: rx.badNumber(rx.stock) };
  if (perDose === undefined || perDose === null || perDose <= 0 || perDose > 100) return { error: rx.badNumber(rx.perDose) };
  if (lowAt === undefined || (lowAt !== null && lowAt >= 100000)) return { error: rx.badNumber(rx.lowStockAt) };
  return {
    body: {
      name: name.slice(0, 120),
      dose: form.dose.trim().slice(0, 60) || null,
      schedule: form.schedule,
      times,
      weekdays: form.schedule === "weekdays" ? [...form.weekdays].sort((a, b) => a - b) : [],
      every_hours: form.schedule === "interval" ? form.everyHours : null,
      starts_on: form.startsOn,
      ends_on: form.endsOn,
      paused: form.paused,
      stock,
      per_dose: perDose,
      // A warning needs something counted to warn about.
      low_stock_at: stock === null ? null : lowAt,
      notes: form.notes.trim().slice(0, 500) || null
    }
  };
}

// ---- Words ----

// The week as people here read it: Saturday first in Arabic, Monday first in English (same as the workout plan).
export const WEEK_ORDER = isArabic ? [5, 6, 0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];

const clockOf = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return formatClock(new Date(2000, 0, 1, hour, minute));
};
export const timeLabel = clockOf;

/** "Every day · 8:00 AM, 8:00 PM" and the like. */
export function scheduleText(medication: Pick<Medication, "schedule" | "times" | "weekdays" | "every_hours">) {
  const times = medication.times.map(clockOf).join(isArabic ? "، " : ", ");
  if (medication.schedule === "interval") return `${rx.everyHours(medication.every_hours ?? 0)} · ${times}`;
  if (medication.schedule === "weekdays") return `${WEEK_ORDER.filter((day) => medication.weekdays.includes(day)).map((day) => rx.weekdays[day]).join(isArabic ? "، " : ", ")} · ${times}`;
  return `${rx.daily} · ${times}`;
}

/** "12 left · about 6 days", or null when the stock isn't counted. */
export function stockText(medication: Medication) {
  if (medication.stock === null) return null;
  const days = daysLeft(medication);
  return days === null ? rx.left(medication.stock) : `${rx.left(medication.stock)} · ${rx.aboutDays(days)}`;
}

export const logDayLabel = (key: string, now = new Date()) =>
  key === dayKey(now) ? rx.today : key === dayKey(addDays(now, -1)) ? rx.yesterday : formatDate(`${key}T12:00:00`, { weekday: "short", day: "numeric", month: "short" });

/** Days from today to a course's last day (0 on the day). */
export function daysToEnd(medication: Medication, now = new Date()) {
  if (!medication.ends_on) return null;
  const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((new Date(`${medication.ends_on}T12:00:00`).getTime() - noon.getTime()) / DAY);
}

const en = {
  medications: "Medications",
  medicationsDetail: "Doses, reminders, what's left",
  todayDoses: "Today's medications",
  myMedications: "My medications",
  log: "Last 7 days",
  add: "Add medication",
  edit: "Edit medication",
  save: "Save",
  saved: "Saved",
  delete: "Delete medication",
  deleteTitle: "Delete this medication?",
  deleteBody: "Its reminders stop and its log is removed.",
  deleted: "Deleted",
  name: "Name",
  namePh: "e.g. Vitamin D",
  dose: "Dose",
  dosePh: "e.g. 500 mg, 1 tablet",
  when: "When",
  schedules: { daily: "Every day", weekdays: "Some days", interval: "Every few hours" } as Record<MedicationSchedule, string>,
  times: "Times",
  addTime: "Add",
  timePh: "Other time, e.g. 21:30",
  badTime: "Type a time like 8:30 or 21:00",
  firstTime: "Starting at",
  everyHours: (n: number) => `Every ${digits(n)} hours`,
  hours: (n: number) => `${digits(n)} h`,
  days: "Days",
  daily: "Every day",
  weekdays: { 0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun" } as Record<number, string>,
  course: "Course",
  courseOn: "Ends on a date",
  courseDetail: "For a course of antibiotics and the like",
  startsOn: "Starts",
  endsOn: "Ends",
  pickEnd: "Pick the last day",
  stockTitle: "Stock",
  stock: "How many you have",
  stockPh: "e.g. 30 (empty: don't count)",
  perDose: "Taken each dose",
  lowStock: "Warn me when it runs low",
  lowStockAt: "Warn at",
  lowStockDetail: "A notification when this many are left",
  notes: "Notes",
  notesPh: "e.g. after food",
  paused: "Paused",
  pausedDetail: "No reminders until you switch it back",
  needName: "Type the medication's name",
  needTime: "Pick at least one time",
  needDay: "Pick at least one day",
  endBeforeStart: "The course can't end before it starts",
  badNumber: (label: string) => `${label}: type a number`,
  taken: "Taken",
  take: "Taken",
  skip: "Skip",
  undo: "Undo",
  options: "More choices",
  states: { taken: "Taken", skipped: "Skipped", upcoming: "Later", due: "Now", missed: "Missed" } as Record<DoseState, string>,
  left: (n: number) => `${digits(n)} left`,
  aboutDays: (n: number) => (n === 0 ? "runs out today" : `about ${digits(n)} day${n === 1 ? "" : "s"}`),
  low: "Running low",
  pausedBadge: "Paused",
  ended: "Course over",
  endsIn: (n: number) => (n <= 0 ? "Last day today" : `${digits(n)} day${n === 1 ? "" : "s"} left in the course`),
  noneToday: "Nothing to take today.",
  empty: "No medications yet.",
  emptyExample: "Vitamin D · 8:00 every day",
  logEmpty: "Nothing to show yet. Doses you take or miss show here.",
  logLine: (taken: number, due: number) => `${digits(taken)} of ${digits(due)} taken`,
  missedNames: (names: string) => `Missed: ${names}`,
  today: "Today",
  yesterday: "Yesterday",
  alertNow: "Time for your dose",
  alertStill: (time: string) => `Still not marked: the ${time} dose`,
  actionTaken: "Taken",
  actionLater: "Remind me later",
  lowAlertTitle: (name: string) => `${name} is running low`,
  lowAlertBody: (left: string) => `${left}. Time to refill.`,
  markedTaken: (name: string) => `${name}: taken`,
  couldNotSave: "Couldn't save. Try again.",
  notifDoses: "Dose reminders",
  notifDosesDetail: "At each dose's time, again after 30 minutes if not marked",
  notifStock: "Running low",
  notifStockDetail: "When a medication reaches the number you set"
};

const ar: typeof en = {
  medications: "الأدوية",
  medicationsDetail: "الجرعات والتذكير وكم باقي",
  todayDoses: "أدوية اليوم",
  myMedications: "أدويتي",
  log: "آخر ٧ أيام",
  add: "أضف دواء",
  edit: "عدّل الدواء",
  save: "حفظ",
  saved: "انحفظ",
  delete: "احذف الدواء",
  deleteTitle: "تحذف هذا الدواء؟",
  deleteBody: "يوقف تذكيره وينحذف سجله.",
  deleted: "انحذف",
  name: "الاسم",
  namePh: "مثلًا فيتامين د",
  dose: "الجرعة",
  dosePh: "مثلًا حبة وحدة، أو ٥٠٠ ملغ",
  when: "متى",
  schedules: { daily: "كل يوم", weekdays: "أيام محددة", interval: "كل كم ساعة" },
  times: "الأوقات",
  addTime: "أضف",
  timePh: "وقت ثاني، مثلًا 21:30",
  badTime: "اكتب الوقت مثل 8:30 أو 21:00",
  firstTime: "يبدأ الساعة",
  everyHours: (n: number) => `كل ${digits(n)} ساعات`,
  hours: (n: number) => `${digits(n)} س`,
  days: "الأيام",
  daily: "كل يوم",
  weekdays: { 0: "الإثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس", 4: "الجمعة", 5: "السبت", 6: "الأحد" },
  course: "المدة",
  courseOn: "له تاريخ نهاية",
  courseDetail: "لكورس مضاد حيوي وأشباهه",
  startsOn: "يبدأ",
  endsOn: "ينتهي",
  pickEnd: "اختر آخر يوم",
  stockTitle: "المخزون",
  stock: "كم عندك منه",
  stockPh: "مثلًا 30 (فاضي: لا تحسب)",
  perDose: "كم تاخذ كل جرعة",
  lowStock: "نبهني إذا قرب يخلص",
  lowStockAt: "نبهني عند",
  lowStockDetail: "إشعار لما يبقى هذا العدد",
  notes: "ملاحظات",
  notesPh: "مثلًا بعد الأكل",
  paused: "موقّف",
  pausedDetail: "ما يذكرك لين ترجعه",
  needName: "اكتب اسم الدواء",
  needTime: "اختر وقت واحد على الأقل",
  needDay: "اختر يوم واحد على الأقل",
  endBeforeStart: "النهاية ما تكون قبل البداية",
  badNumber: (label: string) => `${label}: اكتب رقم`,
  taken: "أخذته",
  take: "أخذته",
  skip: "تخطّي",
  undo: "تراجع",
  options: "خيارات ثانية",
  states: { taken: "أخذته", skipped: "تخطيته", upcoming: "بعدين", due: "الحين", missed: "فاتك" },
  left: (n: number) => `باقي ${digits(n)}`,
  aboutDays: (n: number) => (n === 0 ? "يخلص اليوم" : `يكفي تقريبًا ${digits(n)} يوم`),
  low: "قرب يخلص",
  pausedBadge: "موقّف",
  ended: "خلص الكورس",
  endsIn: (n: number) => (n <= 0 ? "آخر يوم اليوم" : `باقي ${digits(n)} يوم على نهاية الكورس`),
  noneToday: "ما عليك أدوية اليوم.",
  empty: "ما فيه أدوية مضافة.",
  emptyExample: "فيتامين د · 8:00 كل يوم",
  logEmpty: "ما فيه شي للحين. الجرعات اللي تاخذها أو تفوتك تطلع هنا.",
  logLine: (taken: number, due: number) => `أخذت ${digits(taken)} من ${digits(due)}`,
  missedNames: (names: string) => `فاتك: ${names}`,
  today: "اليوم",
  yesterday: "أمس",
  alertNow: "حان وقت الجرعة",
  alertStill: (time: string) => `لسا ما سجلت جرعة ${time}`,
  actionTaken: "أخذته",
  actionLater: "ذكّرني بعدين",
  lowAlertTitle: (name: string) => `${name} قرب يخلص`,
  lowAlertBody: (left: string) => `${left}. وقت تعبّيه.`,
  markedTaken: (name: string) => `${name}: أخذته`,
  couldNotSave: "ما انحفظ. جرّب مرة ثانية.",
  notifDoses: "تذكير الجرعات",
  notifDosesDetail: "في وقت كل جرعة، ومرة ثانية بعد ٣٠ دقيقة إذا ما سجلتها",
  notifStock: "قرب يخلص",
  notifStockDetail: "لما يوصل الدواء للعدد اللي حددته"
};

export const rx = isArabic ? ar : en;
