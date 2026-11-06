import type { ApiClient } from "@/lib/api";
import { digits, isArabic } from "@/lib/i18n";

// Exercise library from Orbit's server (free-exercise-db, public domain), fitted to your gym and injuries.
// Shapes and lists mirror backend/app/routers/exercises.py and backend/app/models/fitness.py.

export const GYM_EQUIPMENT = ["barbell", "dumbbell", "e-z curl bar", "kettlebells", "cable", "machine", "bands", "medicine ball", "exercise ball", "foam roll", "other"] as const;
export type GymItem = (typeof GYM_EQUIPMENT)[number];
export const NO_EQUIPMENT = "body only";

export const MUSCLES = ["abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes", "hamstrings", "lats", "lower back", "middle back", "neck", "quadriceps", "shoulders", "traps", "triceps"] as const;
export type Muscle = (typeof MUSCLES)[number];

// Joints and regions first (what people usually hurt), then single muscles.
export const INJURY_JOINTS = ["neck", "shoulder", "elbow", "wrist", "upper back", "lower back", "hip", "knee", "ankle"] as const;
export const INJURY_MUSCLES = MUSCLES.filter((muscle) => !(INJURY_JOINTS as readonly string[]).includes(muscle));
export const INJURY_AREAS = [...INJURY_JOINTS, ...INJURY_MUSCLES] as const;
export type InjuryArea = (typeof INJURY_AREAS)[number];

export type ExerciseSummary = {
  id: string;
  name: string;
  category: string;
  level: string;
  equipment: string | null;
  force: string | null;
  mechanic: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  image_url: string | null;
  // Your active injuries this exercise works, as its main muscle (avoid) or as a helper (caution).
  avoid: string[];
  caution: string[];
};
export type ExerciseDetail = ExerciseSummary & { instructions: string[]; image_urls: string[]; in_my_gym: boolean };
export type ExerciseSearch = { items: ExerciseSummary[]; total: number; hidden_by_gym: number; hidden_by_injuries: number };
export type GymEquipment = { equipment: GymItem[]; always: string[] };
export type Injury = {
  id: string;
  user_id: string;
  area: InjuryArea;
  note: string | null;
  active: boolean;
  started_on: string | null;
  ended_on: string | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseFilters = { q?: string; muscle?: Muscle | null; equipment?: string | null; onlyMyGym?: boolean; includeInjured?: boolean; limit?: number; offset?: number };

export const PAGE_SIZE = 40;

export function exerciseSearchPath({ q, muscle, equipment, onlyMyGym, includeInjured, limit = PAGE_SIZE, offset = 0 }: ExerciseFilters = {}) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (muscle) params.set("muscle", muscle);
  if (equipment) params.set("equipment", equipment);
  if (onlyMyGym) params.set("only_my_gym", "true");
  if (includeInjured) params.set("include_injured", "true");
  params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  return `/exercises?${params.toString()}`;
}

type Api = Pick<ApiClient, "get" | "post" | "put" | "patch" | "delete">;

export const exercisesApi = {
  search: (api: Api, filters: ExerciseFilters) => api.get<ExerciseSearch>(exerciseSearchPath(filters)),
  detail: (api: Api, id: string) => api.get<ExerciseDetail>(`/exercises/${encodeURIComponent(id)}`),
  gym: (api: Api) => api.get<GymEquipment>("/gym/equipment"),
  setGym: (api: Api, equipment: GymItem[]) => api.put<GymEquipment>("/gym/equipment", { equipment }),
  injuries: (api: Api) => api.get<Injury[]>("/injuries?limit=500"),
  addInjury: (api: Api, area: InjuryArea, note: string, startedOn: string) => api.post<Injury>("/injuries", { area, note: note.trim() || null, started_on: startedOn }),
  // Healed: stays in the list as history and stops filtering exercises.
  heal: (api: Api, injury: Injury, today: string) => api.patch<Injury>(`/injuries/${injury.id}`, { active: false, ended_on: injury.started_on && injury.started_on > today ? injury.started_on : today }),
  reopen: (api: Api, injury: Injury) => api.patch<Injury>(`/injuries/${injury.id}`, { active: true, ended_on: null }),
  deleteInjury: (api: Api, id: string) => api.delete(`/injuries/${id}`)
};

/** Active first, newest first within each group. */
export function sortInjuries(injuries: Injury[]) {
  return [...injuries].sort((a, b) => Number(b.active) - Number(a.active) || b.created_at.localeCompare(a.created_at));
}

export function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

/** Keeps the server's order of the list so saving doesn't reshuffle it. */
export function orderedGym(items: readonly GymItem[]): GymItem[] {
  return GYM_EQUIPMENT.filter((item) => items.includes(item));
}

const labelsEn: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbells", "e-z curl bar": "EZ curl bar", kettlebells: "Kettlebells", cable: "Cable machine", machine: "Machines", bands: "Resistance bands", "medicine ball": "Medicine ball", "exercise ball": "Exercise ball", "foam roll": "Foam roller", other: "Other gear", "body only": "Bodyweight",
  abdominals: "Abs", abductors: "Outer thighs", adductors: "Inner thighs", biceps: "Biceps", calves: "Calves", chest: "Chest", forearms: "Forearms", glutes: "Glutes", hamstrings: "Hamstrings", lats: "Lats", "lower back": "Lower back", "middle back": "Middle back", neck: "Neck", quadriceps: "Quads", shoulders: "Shoulders", traps: "Traps", triceps: "Triceps",
  shoulder: "Shoulder", elbow: "Elbow", wrist: "Wrist", "upper back": "Upper back", hip: "Hip", knee: "Knee", ankle: "Ankle",
  strength: "Strength", stretching: "Stretching", plyometrics: "Plyometrics", powerlifting: "Powerlifting", "olympic weightlifting": "Olympic lifting", strongman: "Strongman", cardio: "Cardio",
  beginner: "Beginner", intermediate: "Intermediate", expert: "Expert", compound: "Compound", isolation: "Isolation"
};

const labelsAr: Record<string, string> = {
  barbell: "بار حديد", dumbbell: "دمبلز", "e-z curl bar": "بار EZ", kettlebells: "كيتل بل", cable: "جهاز الكيبل", machine: "أجهزة", bands: "أحزمة مقاومة", "medicine ball": "كرة طبية", "exercise ball": "كرة تمارين", "foam roll": "فوم رولر", other: "أدوات أخرى", "body only": "وزن الجسم",
  abdominals: "البطن", abductors: "الفخذ الخارجي", adductors: "الفخذ الداخلي", biceps: "الباي", calves: "السمانة", chest: "الصدر", forearms: "الساعد", glutes: "المؤخرة", hamstrings: "الفخذ الخلفي", lats: "الظهر العريض", "lower back": "أسفل الظهر", "middle back": "وسط الظهر", neck: "الرقبة", quadriceps: "الفخذ الأمامي", shoulders: "الأكتاف", traps: "الترابيس", triceps: "التراي",
  shoulder: "الكتف", elbow: "الكوع", wrist: "الرسغ", "upper back": "أعلى الظهر", hip: "الحوض", knee: "الركبة", ankle: "الكاحل",
  strength: "قوة", stretching: "إطالة", plyometrics: "قفز", powerlifting: "باورلفتنق", "olympic weightlifting": "رفع أولمبي", strongman: "سترونق مان", cardio: "كارديو",
  beginner: "مبتدئ", intermediate: "متوسط", expert: "متقدم", compound: "مركّب", isolation: "عزل"
};

const labels = isArabic ? labelsAr : labelsEn;

/** Display name for any key the server sends: equipment, muscle, injury area, category, level. */
export function label(key: string | null | undefined) {
  if (!key) return labels[NO_EQUIPMENT];
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

const en = {
  exercises: "Exercises", gym: "My gym", injuries: "Injuries", searchExercises: "Search exercises", onlyMyGym: "Only my gym", showInjured: "Show injured", allMuscles: "All muscles", anyEquipment: "Any equipment", muscle: "Muscle",
  results: (n: number) => `${digits(n)} exercise${n === 1 ? "" : "s"}`,
  hiddenGym: (n: number) => `${digits(n)} need equipment your gym doesn't have`, hiddenInjury: (n: number) => `${digits(n)} hidden for your injuries`,
  loadMore: "Show more", noMatches: "No exercises match. Try fewer filters.", setUpGym: "Pick your gym's equipment to see only what you can do there.", setUpGymAction: "Set up my gym",
  avoid: (areas: string) => `Works your injured ${areas}`, caution: (areas: string) => `Also loads your ${areas}. Go light.`,
  notInGym: "Your gym list doesn't have this equipment.", steps: "How to do it", primary: "Main muscles", secondary: "Also works", equipment: "Equipment", level: "Level", category: "Type",
  gymHint: "Tick what your gym has. Bodyweight exercises always count.", gymSaved: "Gym saved", saveGym: "Save", gymCount: (n: number) => `${digits(n)} selected`,
  injuriesHint: "While an injury is active, exercises that mainly work it are hidden, and ones that also load it are marked.", addInjury: "Add injury", where: "Where", joints: "Joints and areas", muscles: "Muscles", notePh: "Note, e.g. pain on deep squats", since: "Since", active: "Active", healed: "Healed",
  markHealed: "Mark healed", reopen: "Hurts again", deleteInjury: "Delete", deleteInjuryTitle: "Delete this injury?", deleteInjuryBody: "It's removed from your history too.", noInjuries: "No injuries. Add one if something hurts.", photoCredit: "Photos and steps: free-exercise-db (public domain)", couldNotLoad: "Couldn't load exercises. Pull to try again."
};

const ar: typeof en = {
  exercises: "التمارين", gym: "ناديي", injuries: "الإصابات", searchExercises: "ابحث عن تمرين", onlyMyGym: "ناديي فقط", showInjured: "أظهر المتأثرة بالإصابة", allMuscles: "كل العضلات", anyEquipment: "أي أدوات", muscle: "العضلة",
  results: (n: number) => `${digits(n)} تمرين`,
  hiddenGym: (n: number) => `${digits(n)} تحتاج أدوات غير موجودة في ناديك`, hiddenInjury: (n: number) => `${digits(n)} مخفية بسبب إصاباتك`,
  loadMore: "عرض المزيد", noMatches: "لا توجد تمارين مطابقة. خفف الفلاتر.", setUpGym: "اختر أدوات ناديك لتظهر لك التمارين الممكنة فيه فقط.", setUpGymAction: "إعداد ناديي",
  avoid: (areas: string) => `يشغّل منطقة الإصابة: ${areas}`, caution: (areas: string) => `يضغط أيضًا على: ${areas}. خفف الوزن.`,
  notInGym: "أدوات هذا التمرين ليست في قائمة ناديك.", steps: "طريقة الأداء", primary: "العضلات الأساسية", secondary: "يشغّل أيضًا", equipment: "الأدوات", level: "المستوى", category: "النوع",
  gymHint: "حدد الموجود في ناديك. تمارين وزن الجسم محسوبة دائمًا.", gymSaved: "تم حفظ النادي", saveGym: "حفظ", gymCount: (n: number) => `${digits(n)} محدد`,
  injuriesHint: "ما دامت الإصابة نشطة، تختفي التمارين التي تشغّلها بشكل أساسي، وتتعلّم التي تضغط عليها جزئيًا.", addInjury: "إضافة إصابة", where: "المكان", joints: "المفاصل والمناطق", muscles: "العضلات", notePh: "ملاحظة، مثل: ألم مع السكوات العميق", since: "منذ", active: "نشطة", healed: "تعافيت",
  markHealed: "تعافيت", reopen: "رجع الألم", deleteInjury: "حذف", deleteInjuryTitle: "حذف هذه الإصابة؟", deleteInjuryBody: "ستُحذف من السجل أيضًا.", noInjuries: "لا توجد إصابات. أضف واحدة إذا شيء يوجعك.", photoCredit: "الصور والخطوات: free-exercise-db (ملكية عامة)", couldNotLoad: "تعذر تحميل التمارين. اسحب للمحاولة مرة أخرى."
};

export const et = isArabic ? ar : en;

const join = (areas: string[]) => areas.map(label).join(isArabic ? "، " : ", ").toLowerCase();

/** One line on how an exercise sits with your injuries, or null when it doesn't touch them. */
export function injuryNote(exercise: Pick<ExerciseSummary, "avoid" | "caution">): { tone: "urgent" | "accent"; text: string } | null {
  if (exercise.avoid.length) return { tone: "urgent", text: et.avoid(join(exercise.avoid)) };
  if (exercise.caution.length) return { tone: "accent", text: et.caution(join(exercise.caution)) };
  return null;
}

/** Why the list is shorter than the whole library. */
export function hiddenNote(result: Pick<ExerciseSearch, "hidden_by_gym" | "hidden_by_injuries">) {
  const parts = [result.hidden_by_injuries ? et.hiddenInjury(result.hidden_by_injuries) : null, result.hidden_by_gym ? et.hiddenGym(result.hidden_by_gym) : null];
  return parts.filter(Boolean).join(" · ") || null;
}

/** "Barbell · Quads" under each result. */
export function exerciseSubtitle(exercise: Pick<ExerciseSummary, "equipment" | "primary_muscles">) {
  return [label(exercise.equipment), ...exercise.primary_muscles.map(label)].join(" · ");
}
