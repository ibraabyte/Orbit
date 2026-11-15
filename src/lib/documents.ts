import type { ApiClient } from "@/lib/api";
import { NINE_AM, type AlertTime } from "@/lib/finance";
import { digits, formatDate, isArabic } from "@/lib/i18n";
import { toNumerals } from "@/lib/numerals";
import type { DocumentKind, OfficialDocument } from "@/lib/types";

// Official papers: the day each one expires and the heads-ups before it. The phone schedules the heads-ups itself, the
// same way car renewals work, so they arrive without a connection. Shapes mirror backend/app/routers/documents.py.
// Car papers (istimara, car insurance, inspection) stay on the car screen.

export const DOCUMENT_KINDS: DocumentKind[] = ["national_id", "iqama", "passport", "driving_license", "health_insurance", "visa", "other"];
// Heads-up choices, in days before the expiry (0 is the day itself). Up to four per paper.
export const REMIND_CHOICES = [180, 90, 60, 30, 14, 7, 3, 0];
export const MAX_REMINDERS = 4;
// Within this many days a paper counts as "soon": it shows on Today and gets a number on More.
export const SOON_DAYS = 30;

// Passports take longest to sort out (and many trips need six months left), so their heads-ups start earlier.
export const DEFAULT_REMIND: Record<DocumentKind, number[]> = {
  national_id: [60, 14, 0],
  iqama: [60, 14, 0],
  passport: [180, 30, 0],
  driving_license: [60, 14, 0],
  health_insurance: [30, 7, 0],
  visa: [30, 7, 0],
  other: [30, 7, 0]
};
// How long a renewal usually lasts, for the quick picks when it is renewed. The person can always set the date.
export const RENEW_YEARS: Record<DocumentKind, number[]> = {
  national_id: [10, 5],
  iqama: [1, 2],
  passport: [5, 10],
  driving_license: [10, 5],
  health_insurance: [1],
  visa: [1],
  other: [1, 2, 5]
};
// Renewed on Absher (أبشر): national ID, iqama, passport, licence and visas.
export const ABSHER_URL = "https://www.absher.sa";
export const ON_ABSHER = new Set<DocumentKind>(["national_id", "iqama", "passport", "driving_license", "visa"]);

type Api = Pick<ApiClient, "post" | "patch" | "delete">;
export type DocumentInput = Omit<OfficialDocument, "id" | "user_id" | "created_at" | "updated_at">;

export const documentsApi = {
  add: (api: Api, body: DocumentInput) => api.post<OfficialDocument>("/documents", body),
  update: (api: Api, id: string, body: Partial<DocumentInput>) => api.patch<OfficialDocument>(`/documents/${encodeURIComponent(id)}`, body),
  remove: (api: Api, id: string) => api.delete(`/documents/${encodeURIComponent(id)}`)
};

const DAY = 86_400_000;
const noon = (key: string) => new Date(`${key.slice(0, 10)}T12:00:00`);

/** "2026-11-15" on the phone's own calendar. */
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to the expiry: 0 on the day, negative once it has passed. */
export function daysLeft(document: Pick<OfficialDocument, "expires_on">, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((noon(document.expires_on).getTime() - today.getTime()) / DAY);
}

export type DocumentState = "expired" | "soon" | "ok";
export const stateOf = (left: number): DocumentState => (left < 0 ? "expired" : left <= SOON_DAYS ? "soon" : "ok");

/** The paper's own name, or its kind's. */
export const documentTitle = (document: Pick<OfficialDocument, "kind" | "name">) => document.name ?? dx.kinds[document.kind];

/** Soonest first; expired ones lead, the longest-expired first. */
export function sortedDocuments(documents: OfficialDocument[]) {
  return [...documents].sort((a, b) => a.expires_on.localeCompare(b.expires_on) || documentTitle(a).localeCompare(documentTitle(b)));
}

/** Expired, or expiring within SOON_DAYS. */
export const documentsDueSoon = (documents: OfficialDocument[], now = new Date()) => sortedDocuments(documents).filter((document) => daysLeft(document, now) <= SOON_DAYS);

/** Phone alarms at the heads-up time on each chosen day before the expiry, soonest first, only those still ahead. */
export function documentAlerts(documents: OfficialDocument[], now = new Date(), time: AlertTime = NINE_AM) {
  return documents
    .flatMap((document) =>
      document.remind_days.map((before) => {
        const at = noon(document.expires_on);
        at.setDate(at.getDate() - before);
        at.setHours(time.hour, time.minute, 0, 0);
        const title = documentTitle(document);
        return {
          id: `document-${document.id}-${before}`,
          title: before ? dx.alertIn(title, before) : dx.alertToday(title),
          body: [document.holder, dx.expiresOn(document.expires_on), ON_ABSHER.has(document.kind) ? dx.renewOnAbsher : null].filter(Boolean).join(" · "),
          at,
          url: "/documents"
        };
      })
    )
    .filter((alert) => alert.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The same day the given number of years on (29 Feb lands on 28 Feb). */
export function addYears(key: string, years: number) {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  const last = new Date(year + years, month, 0).getDate();
  return `${year + years}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** A renewal starts from the old expiry if it hasn't passed yet, else from today. */
export function renewedUntil(document: Pick<OfficialDocument, "expires_on">, years: number, now = new Date()) {
  const today = dayKey(now);
  return addYears(document.expires_on > today ? document.expires_on : today, years);
}

// ── Hijri (Umm al-Qura), the calendar Saudi papers print their dates in ──

const HIJRI = "en-u-ca-islamic-umalqura-nu-latn";
let hijriFormat: Intl.DateTimeFormat | null | undefined;

function hijriFormatter() {
  if (hijriFormat === undefined) {
    try {
      const format = new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
      hijriFormat = format.resolvedOptions().calendar === "islamic-umalqura" ? format : null;
    } catch {
      hijriFormat = null;
    }
  }
  return hijriFormat;
}

/** True when this phone can show and read Hijri dates. */
export const hijriAvailable = () => hijriFormatter() !== null;

export type DateParts = { year: number; month: number; day: number };

/** The Hijri day of a "2026-11-15" key, or null where the phone has no Hijri calendar. */
export function toHijri(key: string): DateParts | null {
  const format = hijriFormatter();
  if (!format) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format.formatToParts(new Date(`${key.slice(0, 10)}T12:00:00Z`));
  } catch {
    return null;
  }
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const result = { year: part("year"), month: part("month"), day: part("day") };
  return Number.isFinite(result.year) && Number.isFinite(result.month) && Number.isFinite(result.day) ? result : null;
}

const compare = (a: DateParts, b: DateParts) => a.year - b.year || a.month - b.month || a.day - b.day;
const utcKey = (date: Date) => date.toISOString().slice(0, 10);

/** The Gregorian "2026-11-15" key of a Hijri day, or null if there is no such day (or no Hijri calendar). */
export function fromHijri(target: DateParts): string | null {
  if (!hijriFormatter() || target.month < 1 || target.month > 12 || target.day < 1 || target.day > 30 || target.year < 1300 || target.year > 1600) return null;
  // A first guess from the mean Hijri year, then a walk of a few days to the exact one.
  const guess = Date.UTC(622, 6, 19) + ((target.year - 1) * 354.36667 + (target.month - 1) * 29.5306 + (target.day - 1)) * DAY;
  let date = new Date(guess);
  for (let step = 0; step < 60; step += 1) {
    const at = toHijri(utcKey(date));
    if (!at) return null;
    const order = compare(at, target);
    if (order === 0) return utcKey(date);
    const next = new Date(date.getTime() + (order < 0 ? DAY : -DAY));
    const nextAt = toHijri(utcKey(next));
    // Stepped past it: the month has no such day (a 29-day month asked for the 30th).
    if (nextAt && Math.sign(compare(nextAt, target)) === -Math.sign(order) && compare(nextAt, target) !== 0) return null;
    date = next;
  }
  return null;
}

/** "5 Jumada II 1448 AH" / "٥ جمادى الآخرة ١٤٤٨ هـ", or null without a Hijri calendar. */
export function hijriText(key: string) {
  if (!hijriAvailable()) return null;
  try {
    const text = new Intl.DateTimeFormat(isArabic ? "ar-SA-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key.slice(0, 10)}T12:00:00Z`));
    return digits(text);
  } catch {
    return null;
  }
}

/** Reads typed day, month and year in either digit set. */
export function readParts(day: string, month: string, year: string): DateParts | null {
  const number = (value: string) => {
    const latin = toNumerals(value.trim(), "latn");
    return /^\d{1,4}$/.test(latin) ? Number(latin) : NaN;
  };
  const parts = { day: number(day), month: number(month), year: number(year) };
  return Number.isFinite(parts.day) && Number.isFinite(parts.month) && Number.isFinite(parts.year) ? parts : null;
}

/** A typed Gregorian day as a key, or null when there is no such day. */
export function fromGregorian(parts: DateParts): string | null {
  const { year, month, day } = parts;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── The edit form ──

export type DocumentForm = { kind: DocumentKind; name: string; holder: string; expiresOn: string | null; remindDays: number[]; notes: string };

export const emptyDocumentForm = (kind: DocumentKind = "national_id"): DocumentForm => ({ kind, name: "", holder: "", expiresOn: null, remindDays: DEFAULT_REMIND[kind], notes: "" });

export const documentFormFrom = (document: OfficialDocument): DocumentForm => ({
  kind: document.kind,
  name: document.name ?? "",
  holder: document.holder ?? "",
  expiresOn: document.expires_on,
  remindDays: document.remind_days,
  notes: document.notes ?? ""
});

/** The body to save, or what is missing. */
export function documentBody(form: DocumentForm): { body: DocumentInput } | { error: string } {
  const name = form.name.trim();
  if (form.kind === "other" && !name) return { error: dx.needName };
  if (!form.expiresOn) return { error: dx.needDate };
  if (!form.remindDays.length) return { error: dx.needReminder };
  return {
    body: {
      kind: form.kind,
      name: name || null,
      holder: form.holder.trim() || null,
      expires_on: form.expiresOn,
      remind_days: [...new Set(form.remindDays)].sort((a, b) => b - a).slice(0, MAX_REMINDERS),
      notes: form.notes.trim() || null
    }
  };
}

/** Adds or takes off one heads-up; a fifth one drops the furthest. */
export function toggleRemind(days: number[], day: number) {
  if (days.includes(day)) return days.filter((item) => item !== day);
  return [...days, day].sort((a, b) => b - a).slice(-MAX_REMINDERS);
}

// ── Words ──

const n = (value: number) => digits(value);
const dateText = (key: string) => formatDate(`${key.slice(0, 10)}T12:00:00`, { day: "numeric", month: "short", year: "numeric" });

const en = {
  documents: "Documents",
  detail: "Official papers and when they expire",
  kinds: { national_id: "National ID", iqama: "Iqama", passport: "Passport", driving_license: "Driving licence", health_insurance: "Health insurance", visa: "Visa", other: "Other" } as Record<DocumentKind, string>,
  add: "Add a document",
  edit: "Edit document",
  empty: "Add your ID, passport or licence, and Orbit reminds you well before it expires.",
  emptyExample: "Passport · expires 1 Mar 2027",
  soon: "Expiring soon",
  allGood: "All valid",
  carPapers: "Car papers (istimara, insurance, inspection) are on the Car screen.",
  openCar: "Car",
  daysLeft: (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${n(days)} days left`),
  expiredAgo: (days: number) => (days === 1 ? "Expired yesterday" : `Expired ${n(days)} days ago`),
  monthsLeft: (months: number) => `${n(months)} months left`,
  expiresOn: (key: string) => `Expires ${dateText(key)}`,
  expiredOn: (key: string) => `Expired ${dateText(key)}`,
  alertIn: (title: string, days: number) => `${title} expires in ${n(days)} days`,
  alertToday: (title: string) => `${title} expires today`,
  renewOnAbsher: "Renew on Absher",
  absher: "Absher",
  renewed: "Renewed",
  renewedTitle: "Renewed until?",
  renewedFor: (years: number) => (years === 1 ? "1 more year" : `${n(years)} more years`),
  otherDate: "Another date",
  kind: "Type",
  name: "Name",
  namePh: "e.g. Club membership",
  nameOptional: "Name (optional)",
  holder: "Whose is it?",
  holderPh: "Leave empty if it's yours",
  holderDetail: "For a family member's paper, write their name.",
  expiry: "Expiry date",
  gregorian: "Gregorian",
  hijri: "Hijri",
  day: "Day",
  month: "Month",
  year: "Year",
  pickOnCalendar: "Pick on the calendar",
  noSuchDay: "That day doesn't exist",
  hijriIs: (text: string) => `In Hijri: ${text}`,
  gregorianIs: (text: string) => `That is ${text}`,
  remind: "Remind me",
  remindDetail: "At the heads-up time from Notifications. Up to four.",
  remindChoice: (days: number) => (days === 0 ? "On the day" : days % 30 === 0 && days >= 60 ? `${n(days / 30)} months before` : `${n(days)} days before`),
  notes: "Notes",
  notesPh: "e.g. needs a new photo",
  noNumber: "Orbit doesn't keep the number on the paper.",
  save: "Save",
  saved: "Saved",
  delete: "Delete",
  deleteTitle: "Delete this document?",
  deleteBody: "Its reminders stop too.",
  deleted: "Deleted",
  needName: "Give it a name",
  needDate: "Set the expiry date",
  needReminder: "Pick at least one reminder",
  notif: "Documents expiring",
  notifDetail: "On the days set on each document"
};

const ar: typeof en = {
  documents: "الوثائق",
  detail: "أوراقك الرسمية ومتى تنتهي",
  kinds: { national_id: "الهوية الوطنية", iqama: "الإقامة", passport: "الجواز", driving_license: "رخصة القيادة", health_insurance: "التأمين الصحي", visa: "التأشيرة", other: "غيرها" },
  add: "أضف وثيقة",
  edit: "تعديل الوثيقة",
  empty: "أضف هويتك أو جوازك أو رخصتك، ويذكّرك Orbit قبل تنتهي بوقت كافي.",
  emptyExample: "الجواز · ينتهي ١ مارس ٢٠٢٧",
  soon: "تنتهي قريب",
  allGood: "كلها سارية",
  carPapers: "أوراق السيارة (الاستمارة والتأمين والفحص) في صفحة السيارة.",
  openCar: "السيارة",
  daysLeft: (days: number) => (days === 0 ? "اليوم" : days === 1 ? "بكرة" : `باقي ${n(days)} يوم`),
  expiredAgo: (days: number) => (days === 1 ? "انتهت أمس" : `انتهت من ${n(days)} يوم`),
  monthsLeft: (months: number) => `باقي ${n(months)} شهر`,
  expiresOn: (key: string) => `تنتهي ${dateText(key)}`,
  expiredOn: (key: string) => `انتهت ${dateText(key)}`,
  alertIn: (title: string, days: number) => `${title}: باقي ${n(days)} يوم على الانتهاء`,
  alertToday: (title: string) => `${title}: تنتهي اليوم`,
  renewOnAbsher: "جدّدها من أبشر",
  absher: "أبشر",
  renewed: "جدّدتها",
  renewedTitle: "جدّدتها لين متى؟",
  renewedFor: (years: number) => (years === 1 ? "سنة زيادة" : years === 2 ? "سنتين زيادة" : `${n(years)} سنوات زيادة`),
  otherDate: "تاريخ ثاني",
  kind: "النوع",
  name: "الاسم",
  namePh: "مثلاً: عضوية النادي",
  nameOptional: "الاسم (اختياري)",
  holder: "حق مين؟",
  holderPh: "خلّه فاضي إذا حقك",
  holderDetail: "إذا الوثيقة لأحد من أهلك، اكتب اسمه.",
  expiry: "تاريخ الانتهاء",
  gregorian: "ميلادي",
  hijri: "هجري",
  day: "اليوم",
  month: "الشهر",
  year: "السنة",
  pickOnCalendar: "اختر من التقويم",
  noSuchDay: "هذا اليوم مو موجود",
  hijriIs: (text: string) => `بالهجري: ${text}`,
  gregorianIs: (text: string) => `يوافق ${text}`,
  remind: "ذكّرني",
  remindDetail: "في وقت تنبيه المواعيد من الإشعارات. لين أربع تنبيهات.",
  remindChoice: (days: number) => (days === 0 ? "يوم الانتهاء" : days === 60 ? "قبلها بشهرين" : days % 30 === 0 && days > 60 ? `قبلها بـ ${n(days / 30)} شهور` : `قبلها بـ ${n(days)} يوم`),
  notes: "ملاحظات",
  notesPh: "مثلاً: تحتاج صورة جديدة",
  noNumber: "رقم الوثيقة ما ينحفظ في التطبيق.",
  save: "حفظ",
  saved: "انحفظت",
  delete: "حذف",
  deleteTitle: "تحذف هذي الوثيقة؟",
  deleteBody: "تنبيهاتها توقف بعد.",
  deleted: "انحذفت",
  needName: "اكتب اسمها",
  needDate: "حدد تاريخ الانتهاء",
  needReminder: "اختر تنبيه واحد على الأقل",
  notif: "انتهاء الوثائق",
  notifDetail: "في الأيام اللي تحددها لكل وثيقة"
};

export const dx = isArabic ? ar : en;

/** The badge line: how long is left, or how long ago it expired. */
export function leftText(left: number) {
  if (left < 0) return dx.expiredAgo(-left);
  if (left > 90) return dx.monthsLeft(Math.floor(left / 30));
  return dx.daysLeft(left);
}
