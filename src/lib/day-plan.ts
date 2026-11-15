import { digits, isArabic } from "@/lib/i18n";
import { localDateKey } from "@/lib/insights";
import type { Position, TravelPrefs } from "@/lib/maps";
import { pt, type DayKind } from "@/lib/plan";
import { prayerNamesAr, prayerNamesEn, type PrayerName, type PrayerTime } from "@/lib/prayer-times";

// The morning day plan: today's tasks laid out in time around the prayers, the timed things and WHOOP's energy.
// Shapes mirror backend/app/routers/assistant.py (DayPlanReply) and backend/app/services/day_plan.py.
// /assistant/day/draft is the rules plan (no AI, nothing sent); /assistant/day asks the person's own AI.

export type BlockKind = "prayer" | "reminder" | "appointment" | "travel" | "task" | "workout" | "break";
export type DayBlock = {
  start: string;
  end: string;
  kind: BlockKind;
  title: string;
  task_id: string | null;
  prayer: PrayerName | null;
  priority: "low" | "normal" | "high" | null;
  workout_kind: DayKind | null;
};
export type Energy = { level: "high" | "medium" | "low" | null; recovery: number | null; sleep_hours: number | null };
export type DayPlan = { date: string; start: string; energy: Energy | null; rest_day: boolean; note: string | null; source: "ai" | "rules"; blocks: DayBlock[]; left_out: number };

const pad = (value: number) => String(value).padStart(2, "0");
/** A local wall-clock time as the server reads it: "HH:MM", Western digits. */
export const hhmm = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

/** Only with Google Maps linked: where the phone is and how the person travels, to time the way to appointments. */
export type DayTravel = { origin: Position; prefs: TravelPrefs };

/** What the phone sends: the day, the clock now and today's prayer times. The location stays on the phone, unless
 * Google Maps is linked and an appointment today has a place (then it goes along to time the way there; not kept). */
export function dayPlanBody(prayers: PrayerTime[], now: Date, locale: "en" | "ar", travel?: DayTravel | null) {
  const day = localDateKey(now);
  return {
    date: day,
    locale,
    now: hhmm(now),
    prayers: prayers.filter((prayer) => localDateKey(prayer.at) === day).map((prayer) => ({ name: prayer.name, at: hhmm(prayer.at) })),
    ...(travel ? { origin: travel.origin, travel_mode: travel.prefs.mode, buffer_minutes: travel.prefs.buffer } : {})
  };
}

const minutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

/** The block happening now, else the next one; null once the day's last block is over. */
export function currentIndex(plan: DayPlan, now: Date): number {
  const at = now.getHours() * 60 + now.getMinutes();
  const index = plan.blocks.findIndex((block) => minutes(block.end) > at);
  return index;
}

export const isNow = (block: DayBlock, now: Date) => {
  const at = now.getHours() * 60 + now.getMinutes();
  return minutes(block.start) <= at && at < minutes(block.end);
};

/** Blocks still ahead (or running), for the Today card. */
export function upcomingBlocks(plan: DayPlan, now: Date, count: number): DayBlock[] {
  const index = currentIndex(plan, now);
  return index < 0 ? [] : plan.blocks.slice(index, index + count);
}

/** The time in the app's numerals, kept as one left-to-right run inside Arabic text. */
export const blockTime = (value: string) => digits(value);
// The marks keep "07:15–08:15" in that order inside Arabic text too: Arabic digits around a dash would otherwise flip.
export const blockRange = (block: DayBlock) => `\u2066${digits(block.start)}\u200e–\u200e${digits(block.end)}\u2069`;

const en = {
  title: "Your day plan",
  short: "Day plan",
  open: "Full plan",
  rebuild: "Plan again from now",
  building: "Planning your day…",
  failed: "The plan could not be made.",
  retry: "Try again",
  empty: "Nothing to lay out today. Enjoy the free time.",
  over: "That's the day. Good work.",
  leftOut: (n: number) => (n === 1 ? "One task didn't fit today." : `${digits(n)} tasks didn't fit today.`),
  rules: "Laid out by Orbit's simple rules.",
  noAi: "Connect your AI to get a plan written for your energy. This one uses simple rules.",
  consent: "Allow Orbit to send your day to your AI to get a smarter plan. This one uses simple rules.",
  aiFailed: "Your AI didn't answer, so this plan uses simple rules.",
  now: "Now",
  done: "Done",
  energy: { high: "High energy", medium: "Medium energy", low: "Low energy" },
  recovery: (score: string) => `Recovery ${score}%`,
  sleep: (hours: string) => `Sleep ${hours} h`,
  noWhoop: "No WHOOP recovery today yet, so the plan assumes a normal day.",
  restDay: "Recovery is low: your workout plan says rest today.",
  kinds: { prayer: "Prayer", reminder: "Reminder", appointment: "Appointment", travel: "Way there", task: "Task", workout: "Workout", break: "Break" } as Record<BlockKind, string>,
  breakTitle: "Short break",
  prayer: (name: string) => `${name} prayer`,
  hint: "A new plan every morning, the first time you open Today."
};

const ar: typeof en = {
  title: "خطة يومك",
  short: "خطة اليوم",
  open: "الخطة كاملة",
  rebuild: "رتّبها من جديد من الحين",
  building: "جارٍ ترتيب يومك…",
  failed: "تعذّر ترتيب الخطة.",
  retry: "حاول مرة ثانية",
  empty: "ما فيه شي يترتب اليوم. استمتع بوقتك.",
  over: "خلص اليوم. يعطيك العافية.",
  leftOut: (n: number) => (n === 1 ? "مهمة وحدة ما لقت لها وقت اليوم." : `${digits(n)} مهام ما لقت لها وقت اليوم.`),
  rules: "مرتبة بقواعد Orbit البسيطة.",
  noAi: "اربط الذكاء الاصطناعي عشان يرتب لك الخطة حسب طاقتك. هذي مرتبة بقواعد بسيطة.",
  consent: "اسمح لـOrbit يرسل يومك للذكاء الاصطناعي عشان يرتبه أذكى. هذي مرتبة بقواعد بسيطة.",
  aiFailed: "الذكاء الاصطناعي ما رد، فهذي الخطة مرتبة بقواعد بسيطة.",
  now: "الحين",
  done: "تم",
  energy: { high: "طاقتك عالية", medium: "طاقتك متوسطة", low: "طاقتك منخفضة" },
  recovery: (score: string) => `التعافي ${score}٪`,
  sleep: (hours: string) => `النوم ${hours} ساعة`,
  noWhoop: "ما وصل تعافي اليوم من WHOOP للحين، فالخطة على يوم عادي.",
  restDay: "تعافيك منخفض: خطة التمارين تقول ارتاح اليوم.",
  kinds: { prayer: "صلاة", reminder: "تذكير", appointment: "موعد", travel: "الطريق للموعد", task: "مهمة", workout: "تمرين", break: "استراحة" },
  breakTitle: "استراحة قصيرة",
  prayer: (name: string) => `صلاة ${name}`,
  hint: "خطة جديدة كل صباح، أول ما تفتح شاشة اليوم."
};

export const dp = isArabic ? ar : en;

/** The line shown for a block, in the app's language. Prayer and workout names come from the app, not the server. */
export function blockTitle(block: DayBlock): string {
  if (block.kind === "prayer" && block.prayer) return dp.prayer((isArabic ? prayerNamesAr : prayerNamesEn)[block.prayer]);
  if (block.kind === "workout") return block.workout_kind ? `${dp.kinds.workout}: ${pt.kinds[block.workout_kind]}` : dp.kinds.workout;
  if (block.kind === "break") return block.title || dp.breakTitle;
  return block.title;
}

/** "High energy · Recovery 82% · Sleep 7.4 h", or null without WHOOP. */
export function energyLine(energy: Energy | null): string | null {
  if (!energy) return null;
  return [energy.level ? dp.energy[energy.level] : null, energy.recovery !== null ? dp.recovery(digits(Math.round(energy.recovery))) : null, energy.sleep_hours !== null ? dp.sleep(digits(energy.sleep_hours)) : null]
    .filter(Boolean)
    .join(" · ");
}

// Under "orbit.cache." so signing out clears it; withdrawing the AI agreement drops it too (lib/ask.ts withdrawKeys).
export const dayPlanCacheKey = (userId: string) => `orbit.cache.dayplan.${userId}`;

const isBlock = (value: unknown): value is DayBlock => {
  const block = value as DayBlock;
  return Boolean(block) && typeof block.start === "string" && typeof block.end === "string" && typeof block.kind === "string" && typeof block.title === "string";
};

/** The saved AI plan, only for the same day, language and AI, and only if it is readable. */
export function parseDayPlanCache(raw: string | null, date: string, locale: string, provider: string): DayPlan | null {
  try {
    const value = JSON.parse(raw ?? "null") as { date?: unknown; locale?: unknown; provider?: unknown; plan?: unknown } | null;
    if (!value || value.date !== date || value.locale !== locale || value.provider !== provider) return null;
    const plan = value.plan as DayPlan | undefined;
    return plan && plan.date === date && Array.isArray(plan.blocks) && plan.blocks.every(isBlock) ? plan : null;
  } catch {
    return null;
  }
}

export const dayPlanCacheValue = (date: string, locale: string, provider: string, plan: DayPlan) => JSON.stringify({ date, locale, provider, plan });
