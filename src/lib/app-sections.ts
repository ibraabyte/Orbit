import { digits, isArabic } from "@/lib/i18n";
import type { CalendarEventKind } from "@/lib/calendar";
import type { Profile } from "@/lib/types";

// Sections the person can switch off in Settings → Sections, so Orbit only shows what they use right now. A switched-off
// section leaves Today, More (and its pins), the iPad sidebar and the assistant, and its alerts go quiet. Its data stays
// on the server and comes back when it is switched on again. Tasks and reminders are always on.
// The choice lives on the profile (hidden_sections), so the iPhone and the iPad share it; the server also leaves a hidden
// section out of what the AI sees (backend/app/services/sections.py, same names).

export const SECTION_KEYS = ["health", "food", "exercises", "whoop", "finance", "habits", "library", "vehicles", "media"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** Switching health off hides what lives inside it. */
export const INSIDE: Partial<Record<SectionKey, SectionKey[]>> = { health: ["food", "exercises", "whoop"] };
export const parentOf = (key: SectionKey): SectionKey | null => (Object.keys(INSIDE) as SectionKey[]).find((parent) => INSIDE[parent]!.includes(key)) ?? null;

const isKey = (value: unknown): value is SectionKey => typeof value === "string" && (SECTION_KEYS as readonly string[]).includes(value);

/** What the person switched off, with health's own sections added when health is off. Empty when no profile is loaded. */
export function hiddenSections(profile: Pick<Profile, "hidden_sections"> | null | undefined): Set<SectionKey> {
  const hidden = new Set((profile?.hidden_sections ?? []).filter(isKey));
  for (const [parent, children] of Object.entries(INSIDE) as [SectionKey, SectionKey[]][]) if (hidden.has(parent)) children.forEach((child) => hidden.add(child));
  return hidden;
}

export const sectionOn = (profile: Pick<Profile, "hidden_sections"> | null | undefined, key: SectionKey) => !hiddenSections(profile).has(key);

/** The list to save after switching one section, in a fixed order. Only the person's own choices are kept (not the expansion). */
export function withSection(saved: readonly string[] | null | undefined, key: SectionKey, on: boolean): SectionKey[] {
  const next = new Set((saved ?? []).filter(isKey));
  if (on) next.delete(key);
  else next.add(key);
  return SECTION_KEYS.filter((name) => next.has(name));
}

// Each screen (the first part of its path) and the section it belongs to. Screens not listed are always reachable.
const SCREENS: Record<string, SectionKey> = {
  health: "health",
  "health-goals": "health",
  food: "food",
  "food-add": "food",
  "food-photo": "food",
  "food-scan": "food",
  exercises: "exercises",
  gym: "exercises",
  injuries: "exercises",
  training: "exercises",
  workout: "exercises",
  "workout-pick": "exercises",
  body: "exercises",
  whoop: "whoop",
  finance: "finance",
  accounts: "finance",
  investments: "finance",
  cards: "finance",
  obligations: "finance",
  habits: "habits",
  library: "library",
  vehicles: "vehicles",
  media: "media",
  discover: "media",
  requests: "media",
  title: "media",
  person: "media"
};

/** The section a path or link ("/food", "/exercises/123?x=1") belongs to, or null for one that is always on. */
export function sectionOfPath(path: string): SectionKey | null {
  const first = path.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
  return SCREENS[first] ?? null;
}

/** True when a link leads somewhere that is switched off. */
export const pathHidden = (path: string, hidden: Set<SectionKey>) => {
  const section = sectionOfPath(path);
  return section !== null && hidden.has(section);
};

// Today's day plan: what each kind of event belongs to (meals point at Health, but they are Food).
const EVENT_SECTIONS: Partial<Record<CalendarEventKind, SectionKey>> = {
  meal: "food",
  mealPlan: "food",
  grocery: "food",
  workout: "health",
  weight: "health",
  sleep: "health",
  expense: "finance",
  bill: "finance"
};
export const eventHidden = (kind: CalendarEventKind, hidden: Set<SectionKey>) => {
  const section = EVENT_SECTIONS[kind];
  return section !== undefined && hidden.has(section);
};

// The assistant's kinds (src/lib/assistant.ts KIND_PATHS) and quick-add kinds, by section. The rest are always on.
const KIND_SECTIONS: Record<string, SectionKey> = {
  expense: "finance",
  bill: "finance",
  budget: "finance",
  money_account: "finance",
  investment: "finance",
  card: "finance",
  meal: "food",
  mealPlan: "food",
  food: "food",
  grocery: "food",
  workout: "health",
  sleep: "health",
  weight: "health",
  habit: "habits",
  habit_log: "habits",
  note: "library",
  capture: "library"
};
export const kindHidden = (kind: string, hidden: Set<SectionKey>) => {
  const section = KIND_SECTIONS[kind];
  return section !== undefined && hidden.has(section);
};

// The words for the Sections screen.
const en = {
  sections: "Sections",
  sectionsDetail: "Switch off what you don't use for now. It leaves Today, More and the assistant, and its alerts go quiet. Nothing is deleted: switch it on again and everything is back.",
  sectionsCount: (off: number) => (off ? `${digits(off)} off` : "All on"),
  insideHealth: "Inside Health",
  offWithHealth: "Off with Health",
  alwaysOn: "Tasks and reminders are always on.",
  names: { health: "Health", food: "Food", exercises: "Exercises & gym", whoop: "WHOOP", finance: "Finance", habits: "Habits", library: "Saver", vehicles: "Car", media: "Movies & TV" } as Record<SectionKey, string>,
  details: {
    health: "Body, sleep, goals and everything below",
    food: "Calories, meals, groceries",
    exercises: "Workouts, sets, injuries, body measurements",
    whoop: "Recovery, sleep and strain",
    finance: "Spending, bills, budgets, accounts, cards",
    habits: "Daily and weekly habits",
    library: "Saved links and notes",
    vehicles: "Service and paperwork reminders",
    media: "Seerr: discover and requests"
  } as Record<SectionKey, string>,
  offTitle: "This section is off",
  offBody: "You switched it off in Settings. Its data is kept.",
  turnOn: "Switch it on",
  kindOff: "That part of Orbit is switched off. Switch it on in Settings → Sections to add it."
};
const ar: typeof en = {
  sections: "الأقسام",
  sectionsDetail: "اقفل اللي ما تستخدمه الحين. يختفي من اليوم والمزيد والمساعد، وتسكت تنبيهاته. ما ينحذف شي: افتحه مرة ثانية ويرجع كل شي.",
  sectionsCount: (off: number) => (off ? `${digits(off)} مقفول` : "كلها شغالة"),
  insideHealth: "داخل الصحة",
  offWithHealth: "مقفول مع الصحة",
  alwaysOn: "المهام والتذكيرات شغالة دايم.",
  names: { health: "الصحة", food: "الأكل", exercises: "التمارين والنادي", whoop: "WHOOP", finance: "المالية", habits: "العادات", library: "الحافظة", vehicles: "السيارة", media: "الأفلام والمسلسلات" },
  details: {
    health: "الجسم والنوم والأهداف وكل اللي تحتها",
    food: "السعرات والوجبات والمشتريات",
    exercises: "التمارين والجولات والإصابات وقياسات الجسم",
    whoop: "الاستشفاء والنوم والإجهاد",
    finance: "المصاريف والفواتير والميزانية والحسابات والبطاقات",
    habits: "العادات اليومية والأسبوعية",
    library: "الروابط والملاحظات المحفوظة",
    vehicles: "تذكيرات الصيانة والأوراق",
    media: "Seerr: الاكتشاف والطلبات"
  },
  offTitle: "هذا القسم مقفول",
  offBody: "قفلته من الإعدادات. بياناته محفوظة.",
  turnOn: "افتحه",
  kindOff: "هذا الجزء من Orbit مقفول. افتحه من الإعدادات ← الأقسام عشان تضيفه."
};
export const st = isArabic ? ar : en;
