import type { ApiClient } from "@/lib/api";
import { label } from "@/lib/exercises";
import { digits, formatDate, isArabic } from "@/lib/i18n";
import type { Session } from "@/lib/training";

// The automatic workout plan. Shapes mirror backend/app/routers/plan.py and backend/app/schemas/plan.py.

export const GOALS = ["muscle", "strength", "fitness", "fat_loss"] as const;
export type Goal = (typeof GOALS)[number];
export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];
export type DayKind = "full_a" | "full_b" | "push" | "pull" | "legs" | "upper" | "lower";
export type Adjustment = "none" | "rest" | "light" | "normal" | "push";
export type DayStatus = "planned" | "missed" | "started" | "done";

// Weekdays as the server counts them: Monday 0 … Sunday 6.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Plan = { goal: Goal; level: Level; weekdays: Weekday[] };

export type PlannedExercise = {
  id: string;
  exercise_id: string | null;
  name: string;
  slot: string;
  muscle: string;
  position: number;
  sets: number;
  base_sets: number;
  reps_low: number;
  reps_high: number;
  rest_seconds: number;
  swapped_from: string | null;
  image_url: string | null;
  equipment: string | null;
};

export type PlannedDay = {
  id: string;
  date: string;
  kind: DayKind;
  status: DayStatus;
  workout_id: string | null;
  adjustment: Adjustment;
  recovery_score: number | null;
  exercises: PlannedExercise[];
  dropped: string[];
};

export type Week = { plan: Plan | null; today: string; recovery: { score: number | null; adjustment: Adjustment }; days: PlannedDay[]; gym_empty: boolean };

export type Alternative = { id: string; name: string; equipment: string | null; mechanic: string | null; level: string; image_url: string | null; done_before: boolean };

type Api = Pick<ApiClient, "get" | "post" | "put" | "delete">;

export const planApi = {
  get: (api: Api) => api.get<Plan | null>("/plan"),
  save: (api: Api, plan: Plan) => api.put<Plan>("/plan", plan),
  stop: (api: Api) => api.delete("/plan"),
  week: (api: Api) => api.get<Week>("/plan/week"),
  day: (api: Api, id: string) => api.get<PlannedDay>(`/plan/days/${id}`),
  start: (api: Api, day: PlannedDay) => api.post<Session>(`/plan/days/${day.id}/start`, { type: pt.kinds[day.kind] }),
  move: (api: Api, id: string) => api.post<{ date: string }>(`/plan/days/${id}/move`, {}),
  alternatives: (api: Api, entryId: string) => api.get<Alternative[]>(`/plan/exercises/${entryId}/alternatives`),
  swap: (api: Api, entryId: string, exerciseId: string) => api.post<PlannedDay>(`/plan/exercises/${entryId}/swap`, { exercise_id: exerciseId }),
  sessionAlternatives: (api: Api, entryId: string) => api.get<Alternative[]>(`/training/workout-exercises/${entryId}/alternatives`),
  sessionSwap: (api: Api, entryId: string, exerciseId: string) => api.post<Session>(`/training/workout-exercises/${entryId}/swap`, { exercise_id: exerciseId })
};

/** The server's weekday (Monday 0) for a JS date (Sunday 0). */
export function weekdayOf(date: Date): Weekday {
  return ((date.getDay() + 6) % 7) as Weekday;
}

// The week as people here read it: Saturday first in Arabic, Monday first in English.
export const WEEK_ORDER: Weekday[] = isArabic ? [5, 6, 0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6];

/** Spread-out days for a number of sessions a week, with Friday off: 3 → Sunday, Tuesday, Thursday. */
export function defaultWeekdays(count: number): Weekday[] {
  const byCount: Record<number, Weekday[]> = {
    1: [6],
    2: [6, 2],
    3: [6, 1, 3],
    4: [6, 0, 2, 3],
    5: [6, 0, 1, 2, 3],
    6: [5, 6, 0, 1, 2, 3],
    7: [0, 1, 2, 3, 4, 5, 6]
  };
  return [...(byCount[Math.min(7, Math.max(1, Math.round(count)))] ?? byCount[3])].sort((a, b) => a - b) as Weekday[];
}

/** Which split the server builds for these choices (mirrors split_for in app/services/workout_plan.py). */
export function splitFor(days: number, level: Level): DayKind[] {
  if (days <= 2 || (days === 3 && level === "beginner")) return ["full_a", "full_b"];
  if (days === 3) return ["push", "pull", "legs"];
  if (days === 4) return ["upper", "lower"];
  if (days === 5) return ["push", "pull", "legs", "upper", "lower"];
  return ["push", "pull", "legs"];
}

const ltr = (text: string) => (isArabic ? `⁦${digits(text)}⁩` : digits(text));

/** "4 × 6–10"; "3 × 12" when the range is one number. */
export function setsText(entry: Pick<PlannedExercise, "sets" | "reps_low" | "reps_high">) {
  const reps = entry.reps_low === entry.reps_high ? `${entry.reps_low}` : `${entry.reps_low}–${entry.reps_high}`;
  return ltr(`${entry.sets} × ${reps}`);
}

/** "+1" or "−1" next to the sets when today's recovery changed them. */
export function setsChange(entry: Pick<PlannedExercise, "sets" | "base_sets">) {
  const change = entry.sets - entry.base_sets;
  if (!change) return null;
  return ltr(change > 0 ? `+${change}` : `−${Math.abs(change)}`);
}

/** The badge on a planned exercise: "4 × 6–10", or "3 × 6–10 (−1)" when recovery changed it. One left-to-right run in
 * Arabic text, so the brackets and the sign stay where they belong. */
export function setsBadge(entry: Pick<PlannedExercise, "sets" | "base_sets" | "reps_low" | "reps_high">) {
  const reps = entry.reps_low === entry.reps_high ? `${entry.reps_low}` : `${entry.reps_low}–${entry.reps_high}`;
  const change = entry.sets - entry.base_sets;
  const note = change ? ` (${change > 0 ? "+" : "−"}${Math.abs(change)})` : "";
  return ltr(`${entry.sets} × ${reps}${note}`);
}

/** The muscles a day works, in order, without repeats: "Chest · Shoulders · Triceps". */
export function dayMuscles(day: Pick<PlannedDay, "exercises">, max = 3) {
  const muscles = [...new Set(day.exercises.map((entry) => entry.muscle))];
  return muscles.slice(0, max).map(label).join(" · ");
}

/** "Sun 16 Nov", or "Today" / "Tomorrow" against the server's today. */
export function dayLabel(date: string, today: string) {
  if (date === today) return pt.today;
  if (date === addDays(today, 1)) return pt.tomorrow;
  return formatDate(`${date}T12:00:00`, { weekday: "short", day: "numeric", month: "short" });
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/** The line on today's card about recovery, or null when there is no workout today. */
export function recoveryLine(day: Pick<PlannedDay, "adjustment" | "recovery_score">) {
  const score = day.recovery_score === null ? "" : digits(String(Math.round(day.recovery_score)));
  switch (day.adjustment) {
    case "rest":
      return pt.recovery.rest(score);
    case "light":
      return pt.recovery.light(score);
    case "push":
      return pt.recovery.push(score);
    case "normal":
      return pt.recovery.normal(score);
    default:
      return pt.recovery.none;
  }
}

/** Today's planned day, if the plan has one. */
export function todayOf(week: Pick<Week, "days" | "today"> | null) {
  return week?.days.find((day) => day.date === week.today) ?? null;
}

/** Equipment for an alternative's line in the swap list: "Dumbbell Bench Press · Dumbbells". */
export function alternativeLabel(option: Alternative) {
  return `${option.name} · ${label(option.equipment)}${option.done_before ? ` · ${pt.doneBefore}` : ""}`;
}

const en = {
  plan: "Workout plan", todayWorkout: "Today's workout", planDetail: "Built for you, fitted to your recovery", setUp: "Set up your plan", setUpDetail: "Pick your goal and the days you can go. The app builds each workout from your gym's equipment and leaves out what your injuries rule out.",
  goal: "Goal", goals: { muscle: "Build muscle", strength: "Get stronger", fitness: "General fitness", fat_loss: "Lose fat" } as Record<Goal, string>,
  level: "Level", levels: { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as Record<Level, string>,
  days: "Training days", daysCount: (n: number) => `${digits(n)} day${n === 1 ? "" : "s"} a week`, split: "Split", pickDay: "Pick at least one day.",
  build: "Build my plan", save: "Save plan", saved: "Plan saved", edit: "Edit plan", stop: "Stop the plan", stopTitle: "Stop the plan?", stopBody: "Its coming days are removed. Workouts you logged stay.", stopped: "Plan stopped",
  today: "Today", tomorrow: "Tomorrow", restToday: "Rest day today", restTodayDetail: "Nothing planned. Recover and come back tomorrow.", thisWeek: "This week", restDay: "Rest",
  weekdays: { 0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun" } as Record<Weekday, string>,
  kinds: { full_a: "Full body A", full_b: "Full body B", push: "Push", pull: "Pull", legs: "Legs", upper: "Upper body", lower: "Lower body" } as Record<DayKind, string>,
  status: { planned: "Planned", missed: "Missed", started: "In progress", done: "Done" } as Record<DayStatus, string>,
  start: "Start workout", resume: "Resume workout", notGoing: "Not going today", notGoingDay: "Move to the next day", moved: (day: string) => `Moved to ${day}`, startLight: "Go light anyway",
  swap: "Swap", swapTitle: "Swap for", swapDetail: "Same muscle, from your gym's equipment", noAlternatives: "Nothing else fits this muscle with your gym's equipment.", swapped: "Swapped", swappedBadge: "Swapped", doneBefore: "done before", swapLocked: "Some sets are done. Add the other exercise instead.",
  droppedToday: "Left out today", exercises: (n: number) => `${digits(n)} exercise${n === 1 ? "" : "s"}`, empty: "Nothing fits this day with your gym and injuries. Swap days or set up your gym.",
  gymEmpty: "Your gym list is empty, so the plan uses bodyweight exercises.", gymAction: "Set up my gym",
  recovery: {
    rest: (score: string) => `Recovery ${score}% is low. Rest is the better call today; if you go, the workout is lighter.`,
    light: (score: string) => `Recovery ${score}%: a lighter day, one set fewer on each exercise.`,
    normal: (score: string) => `Recovery ${score}%: the plan as it is.`,
    push: (score: string) => `Recovery ${score}%: you're fresh, one set more on the first two.`,
    none: "No WHOOP recovery for today yet, so the plan stays as it is."
  },
  couldNotLoad: "Couldn't load the plan. Pull to try again."
};

const ar: typeof en = {
  plan: "خطة التمارين", todayWorkout: "تمرين اليوم", planDetail: "تنبني لك وتتعدل حسب تعافيك", setUp: "جهّز خطتك", setUpDetail: "اختر هدفك والأيام اللي تقدر تروح فيها. التطبيق يبني كل تمرين من أدوات ناديك ويشيل اللي تمنعه إصاباتك.",
  goal: "الهدف", goals: { muscle: "بناء عضل", strength: "زيادة القوة", fitness: "لياقة عامة", fat_loss: "حرق دهون" },
  level: "المستوى", levels: { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" },
  days: "أيام التمرين", daysCount: (n: number) => `${digits(n)} أيام بالأسبوع`, split: "التقسيم", pickDay: "اختر يوم واحد على الأقل.",
  build: "ابنِ خطتي", save: "احفظ الخطة", saved: "انحفظت الخطة", edit: "عدّل الخطة", stop: "أوقف الخطة", stopTitle: "توقف الخطة؟", stopBody: "تنشال أيامها الجاية. تمارينك المسجلة تبقى.", stopped: "توقفت الخطة",
  today: "اليوم", tomorrow: "بكرة", restToday: "اليوم راحة", restTodayDetail: "ما فيه تمرين اليوم. ارتاح وارجع بكرة.", thisWeek: "هذا الأسبوع", restDay: "راحة",
  weekdays: { 0: "الإثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس", 4: "الجمعة", 5: "السبت", 6: "الأحد" },
  kinds: { full_a: "جسم كامل (أ)", full_b: "جسم كامل (ب)", push: "دفع", pull: "سحب", legs: "أرجل", upper: "الجزء العلوي", lower: "الجزء السفلي" },
  status: { planned: "مخطط", missed: "فاتك", started: "شغّال", done: "تم" },
  start: "ابدأ التمرين", resume: "كمّل التمرين", notGoing: "ما راح أروح اليوم", notGoingDay: "أجّله لليوم اللي بعده", moved: (day: string) => `انتقل إلى ${day}`, startLight: "أبي أتمرن خفيف",
  swap: "بدّل", swapTitle: "بدّله بـ", swapDetail: "نفس العضلة، من أدوات ناديك", noAlternatives: "ما فيه بديل لهذي العضلة بأدوات ناديك.", swapped: "تبدّل", swappedBadge: "مبدّل", doneBefore: "سويته قبل", swapLocked: "فيه جولات خلصت. أضف التمرين الثاني بدل التبديل.",
  droppedToday: "منشال اليوم", exercises: (n: number) => `${digits(n)} تمارين`, empty: "ما فيه تمرين يناسب هذا اليوم بأدوات ناديك وإصاباتك. جهّز ناديك.",
  gymEmpty: "قائمة ناديك فاضية، فالخطة تستخدم تمارين وزن الجسم.", gymAction: "جهّز ناديي",
  recovery: {
    rest: (score: string) => `تعافيك ${score}٪ منخفض. الأفضل ترتاح اليوم، وإذا رحت فالتمرين أخف.`,
    light: (score: string) => `تعافيك ${score}٪: يوم أخف، جولة أقل في كل تمرين.`,
    normal: (score: string) => `تعافيك ${score}٪: الخطة مثل ما هي.`,
    push: (score: string) => `تعافيك ${score}٪: أنت جاهز، جولة زيادة في أول تمرينين.`,
    none: "ما وصل تعافي اليوم من WHOOP للحين، فالخطة مثل ما هي."
  },
  couldNotLoad: "تعذر تحميل الخطة. اسحب للمحاولة مرة ثانية."
};

export const pt = isArabic ? ar : en;
