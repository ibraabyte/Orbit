import { digits, isArabic } from "@/lib/i18n";
import type { Profile, WeightLog } from "@/lib/types";

// Health is one place: today's numbers on top, then Food, Exercises and WHOOP under it, your body and your goals.

const en = {
  todayLabel: "Today",
  inHealth: "In Health",
  body: "Body",
  goals: "Daily goals",
  editGoals: "Edit",
  byHand: "Logged by hand",
  byHandWhoop: "WHOOP brings sleep and workouts in by itself. These are the ones you typed.",
  eaten: "Eaten",
  readiness: "Recovery",
  sleepLast: "Sleep",
  strain: "Strain",
  workoutsWeek: "Workouts · 7d",
  foodDetail: "Today's log, barcode, plate photo",
  exercisesDetail: "Library, fitted to your gym and injuries",
  gymDetail: "What your gym has",
  injuriesDetail: "Hides exercises that hurt",
  whoopDetail: "Recovery, sleep, strain",
  whoopConnect: "Connect",
  noWeight: "No weight yet.",
  weightExample: "weight 82",
  sleepExample: "slept 7h q4",
  workoutExample: "workout 40m run",
  notSet: "Not set",
  goalCalories: "Calories (kcal)",
  goalProtein: "Protein (g)",
  goalCarbs: "Carbs (g)",
  goalFat: "Fat (g)",
  goalWorkout: "Workout minutes a week",
  goalsHint: "Leave a box empty to have no goal for it. Food and Today compare against these.",
  goalsSaved: "Goals saved",
  saveGoals: "Save",
  badNumber: (label: string) => `${label}: type a whole number`,
  tooBig: (label: string, max: number) => `${label}: ${max} at most`,
  workoutNeeded: "Workout minutes can't be empty",
  activeInjuries: (n: number) => `${digits(n)} active`
};

const ar: typeof en = {
  todayLabel: "اليوم",
  inHealth: "داخل الصحة",
  body: "الجسم",
  goals: "الأهداف اليومية",
  editGoals: "تعديل",
  byHand: "مسجّل يدويًا",
  byHandWhoop: "WHOOP يجيب النوم والتمارين بنفسه. هذي اللي كتبتها أنت.",
  eaten: "أكلت",
  readiness: "الاستشفاء",
  sleepLast: "النوم",
  strain: "الإجهاد",
  workoutsWeek: "تمرين · ٧ أيام",
  foodDetail: "سجل اليوم، الباركود، تصوير الصحن",
  exercisesDetail: "مكتبة التمارين حسب ناديك وإصاباتك",
  gymDetail: "الأدوات اللي في ناديك",
  injuriesDetail: "تخفي التمارين اللي تضرك",
  whoopDetail: "الاستشفاء، النوم، الإجهاد",
  whoopConnect: "اربط",
  noWeight: "ما فيه وزن مسجل.",
  weightExample: "وزني 82",
  sleepExample: "نمت 7 ساعات",
  workoutExample: "تمرين 40 دقيقة جري",
  notSet: "غير محدد",
  goalCalories: "السعرات (kcal)",
  goalProtein: "البروتين (g)",
  goalCarbs: "الكربوهيدرات (g)",
  goalFat: "الدهون (g)",
  goalWorkout: "دقائق التمرين في الأسبوع",
  goalsHint: "اترك الخانة فاضية إذا ما تبي هدف لها. الأكل واليوم يقارنون بهذي الأهداف.",
  goalsSaved: "انحفظت الأهداف",
  saveGoals: "حفظ",
  badNumber: (label: string) => `${label}: اكتب رقم صحيح`,
  tooBig: (label: string, max: number) => `${label}: الحد ${max}`,
  workoutNeeded: "دقائق التمرين ما تكون فاضية",
  activeInjuries: (n: number) => `${digits(n)} نشطة`
};

export const ht = isArabic ? ar : en;

export type GoalKey = "daily_calorie_target" | "daily_protein_target" | "daily_carbs_target" | "daily_fat_target" | "weekly_workout_minutes_target";

export type GoalsForm = Record<GoalKey, string>;

// Same limits as the server's ProfileUpdate (backend/app/schemas/profile.py).
export const goalFields: { key: GoalKey; label: string; max: number; required?: boolean }[] = [
  { key: "daily_calorie_target", label: ht.goalCalories, max: 20000 },
  { key: "daily_protein_target", label: ht.goalProtein, max: 1000 },
  { key: "daily_carbs_target", label: ht.goalCarbs, max: 2000 },
  { key: "daily_fat_target", label: ht.goalFat, max: 1000 },
  { key: "weekly_workout_minutes_target", label: ht.goalWorkout, max: 10080, required: true }
];

type GoalSource = Partial<Pick<Profile, GoalKey>> | null | undefined;

/** The goals as text for the form; an unset goal is an empty box. */
export function goalsForm(profile: GoalSource): GoalsForm {
  const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));
  return {
    daily_calorie_target: text(profile?.daily_calorie_target),
    daily_protein_target: text(profile?.daily_protein_target),
    daily_carbs_target: text(profile?.daily_carbs_target),
    daily_fat_target: text(profile?.daily_fat_target),
    weekly_workout_minutes_target: text(profile?.weekly_workout_minutes_target ?? 150)
  };
}

/** Turns the form into the PATCH /profile body, or says which box is wrong. Arabic digits count. */
export function goalsBody(form: GoalsForm): { body: Record<GoalKey, number | null> } | { error: string } {
  const body = {} as Record<GoalKey, number | null>;
  for (const field of goalFields) {
    const raw = toLatinDigits(form[field.key]).trim();
    if (!raw) {
      if (field.required) return { error: ht.workoutNeeded };
      body[field.key] = null;
      continue;
    }
    if (!/^\d+$/.test(raw)) return { error: ht.badNumber(field.label) };
    const value = Number(raw);
    if (value > field.max) return { error: ht.tooBig(field.label, field.max) };
    body[field.key] = value;
  }
  return { body };
}

export function goalsChanged(form: GoalsForm, profile: GoalSource) {
  const saved = goalsForm(profile);
  return goalFields.some(({ key }) => toLatinDigits(form[key]).trim() !== saved[key]);
}

function toLatinDigits(text: string) {
  return text.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

/** The last few weigh-ins, newest first, each with its change from the one before. */
export function weightHistory(weightLogs: WeightLog[], count = 5) {
  const sorted = [...weightLogs].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  return sorted.slice(0, count).map((log, index) => {
    const previous = sorted[index + 1];
    const delta = previous && previous.unit === log.unit ? Number((log.weight - previous.weight).toFixed(1)) : null;
    return { log, delta };
  });
}

/** "↓0.4" / "↑1.2" / null for no change or nothing to compare. */
export function deltaText(delta: number | null) {
  if (!delta) return null;
  return `${delta < 0 ? "↓" : "↑"}${Math.abs(delta)}`;
}

/** WHOOP's workout minutes over the last 7 days (today included), from its daily rows ("YYYY-MM-DD"). */
export function whoopWeekMinutes(daily: { date: string; workout_minutes: number }[], now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const from = localKey(start);
  const to = localKey(now);
  return daily.filter((day) => day.date >= from && day.date <= to).reduce((sum, day) => sum + (day.workout_minutes || 0), 0);
}

function localKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
