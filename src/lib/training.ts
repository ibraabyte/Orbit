import type { ApiClient } from "@/lib/api";
import { digits, isArabic } from "@/lib/i18n";
import type { WeightLog } from "@/lib/types";

// Gym sessions logged set by set, each exercise's history and personal bests, and body measurements.
// Shapes mirror backend/app/routers/training.py and backend/app/schemas/training.py.

export type WeightUnit = "kg" | "lb";

export type WorkoutSet = {
  id: string;
  user_id: string;
  workout_exercise_id: string;
  position: number;
  reps: number | null;
  weight: number | null;
  unit: WeightUnit;
  warmup: boolean;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionExercise = {
  id: string;
  user_id: string;
  workout_id: string;
  exercise_id: string | null;
  name: string;
  position: number;
  rest_seconds: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  sets: WorkoutSet[];
};

export type Session = {
  id: string;
  type: string;
  logged_at: string;
  duration_minutes: number | null;
  notes: string | null;
  in_progress: boolean;
  exercises: SessionExercise[];
};

export type SessionSummary = {
  id: string;
  type: string;
  logged_at: string;
  duration_minutes: number | null;
  in_progress: boolean;
  exercise_names: string[];
  sets_done: number;
  volume_kg: number;
};

export type SetBrief = { weight: number | null; unit: WeightUnit; reps: number | null; warmup: boolean };
export type PastSession = { workout_id: string; logged_at: string; sets: SetBrief[]; volume_kg: number };
export type Best = { workout_id: string; logged_at: string; weight: number | null; unit: WeightUnit; reps: number | null; value: number };
export type Bests = { heaviest: Best | null; one_rep_max: Best | null; most_reps: Best | null; best_volume: Best | null };
export type ExerciseHistory = { sessions: PastSession[]; bests: Bests };

export const MEASUREMENT_KINDS = ["waist", "chest", "hips", "arm", "thigh", "calf", "neck", "shoulders", "body_fat"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export type LengthUnit = "cm" | "in";
export type BodyMeasurement = { id: string; user_id: string; kind: MeasurementKind; value: number; unit: LengthUnit | "%"; measured_at: string; note: string | null; created_at: string };

// Rest choices between sets, in seconds. 0 turns the timer off for that exercise.
export const REST_CHOICES = [0, 45, 60, 90, 120, 150, 180, 240, 300] as const;

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;

export type ExerciseKey = { exercise_id: string | null; name: string };

export function historyPath(key: ExerciseKey, excludeWorkout?: string, limit = 10) {
  const params = new URLSearchParams();
  if (key.exercise_id) params.set("exercise_id", key.exercise_id);
  else params.set("name", key.name);
  if (excludeWorkout) params.set("exclude_workout", excludeWorkout);
  params.set("limit", String(limit));
  return `/training/history?${params.toString()}`;
}

export const trainingApi = {
  active: (api: Api) => api.get<Session | null>("/training/active"),
  sessions: (api: Api, limit = 30) => api.get<SessionSummary[]>(`/training/sessions?limit=${limit}`),
  session: (api: Api, id: string) => api.get<Session>(`/training/sessions/${id}`),
  start: (api: Api, body: { type?: string; repeat_of?: string } = {}) => api.post<Session>("/training/sessions", body),
  finish: (api: Api, id: string) => api.post<Session>(`/training/sessions/${id}/finish`, {}),
  rename: (api: Api, id: string, type: string) => api.patch(`/workouts/${id}`, { type }),
  discard: (api: Api, id: string) => api.delete(`/workouts/${id}`),
  addExercise: (api: Api, sessionId: string, body: { exercise_id?: string; name?: string; sets?: number }) => api.post<Session>(`/training/sessions/${sessionId}/exercises`, body),
  updateExercise: (api: Api, id: string, body: { rest_seconds?: number; note?: string | null; position?: number }) => api.patch<SessionExercise>(`/workout-exercises/${id}`, body),
  removeExercise: (api: Api, id: string) => api.delete(`/workout-exercises/${id}`),
  addSet: (api: Api, exercise: SessionExercise) => {
    const last = exercise.sets[exercise.sets.length - 1];
    return api.post<WorkoutSet>("/workout-sets", { workout_exercise_id: exercise.id, position: last ? last.position + 1 : 0, weight: last?.weight ?? null, reps: last?.reps ?? null, unit: last?.unit ?? "kg" });
  },
  updateSet: (api: Api, id: string, body: Partial<Pick<WorkoutSet, "reps" | "weight" | "unit" | "warmup" | "done">>) => api.patch<WorkoutSet>(`/workout-sets/${id}`, body),
  removeSet: (api: Api, id: string) => api.delete(`/workout-sets/${id}`),
  history: (api: Api, key: ExerciseKey, excludeWorkout?: string, limit?: number) => api.get<ExerciseHistory>(historyPath(key, excludeWorkout, limit)),
  measurements: (api: Api) => api.get<BodyMeasurement[]>("/body-measurements?limit=1000"),
  addMeasurement: (api: Api, body: { kind: MeasurementKind; value: number; unit: LengthUnit | "%"; measured_at: string }) => api.post<BodyMeasurement>("/body-measurements", body),
  removeMeasurement: (api: Api, id: string) => api.delete(`/body-measurements/${id}`),
  addWeight: (api: Api, weight: number, unit: WeightUnit, at: string) => api.post<WeightLog>("/weight-logs", { weight, unit, logged_at: at }),
  removeWeight: (api: Api, id: string) => api.delete(`/weight-logs/${id}`)
};

/** A number typed in a box: Arabic digits and a comma work too. Null when empty or not a number. */
export function parseNumber(text: string): number | null {
  const western = text.trim().replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[,٫]/g, ".");
  if (!western) return null;
  const value = Number(western);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const trim = (value: number) => String(Math.round(value * 10) / 10);

// Numbers with units inside Arabic text keep their own left-to-right order ("60 kg × 8", not "8 × kg 60").
const ltr = (text: string) => (isArabic && text ? `\u2066${digits(text)}\u2069` : digits(text));

/** "60 kg × 8", "× 12" for bodyweight, "60 kg" before reps are set. */
export function setText(set: Pick<SetBrief, "weight" | "unit" | "reps">) {
  const weight = set.weight ? `${trim(set.weight)} ${set.unit}` : null;
  const reps = set.reps === null ? null : `× ${set.reps}`;
  return ltr([weight, reps].filter(Boolean).join(" ")) || "–";
}

/** "60×8" for the narrow "last time" column; "×12" for bodyweight. */
export function shortSet(set: Pick<SetBrief, "weight" | "reps">) {
  return digits(`${set.weight ? trim(set.weight) : ""}×${set.reps ?? "–"}`);
}

/** "3 × 8 · 60 kg" when every set matches, otherwise each set: "60×8, 65×6". */
export function sessionLine(sets: SetBrief[]) {
  const work = sets.filter((set) => !set.warmup);
  const shown = work.length ? work : sets;
  if (!shown.length) return "";
  const first = shown[0];
  if (shown.every((set) => set.weight === first.weight && set.reps === first.reps && set.unit === first.unit)) {
    const weight = first.weight ? ` · ${trim(first.weight)} ${first.unit}` : "";
    return ltr(`${shown.length} × ${first.reps ?? "–"}${weight}`);
  }
  return ltr(shown.map(shortSet).join(", "));
}

/** "1:30", "45 s", "Off". */
export function restText(seconds: number) {
  if (!seconds) return tt.restOff;
  if (seconds < 60) return digits(isArabic ? `${seconds} ث` : `${seconds} s`);
  return clock(seconds);
}

/** "4:05" from seconds; hours when it's that long: "1:02:09". */
export function clock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return digits(h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`);
}

/** Seconds since the session started, for the running clock. */
export function elapsedSeconds(startedAt: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

/** Seconds left on a rest that ends at endsAt (ms), never below zero. */
export function restLeft(endsAt: number | null, now: number) {
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

const LB = 0.45359237;
const kg = (weight: number | null, unit: WeightUnit) => (weight ?? 0) * (unit === "lb" ? LB : 1);

export type BestKind = "heaviest" | "one_rep_max" | "most_reps";

/** Which records this set beats, compared with the bests from before this session. Warm-ups never count. */
export function newRecords(set: Pick<WorkoutSet, "weight" | "unit" | "reps" | "warmup" | "done">, bests: Bests | null): BestKind[] {
  if (!bests || !set.done || set.warmup || !set.reps) return [];
  const out: BestKind[] = [];
  const weight = kg(set.weight, set.unit);
  // A first time is not a record; it needs something to beat.
  if (set.weight && bests.heaviest && weight > kg(bests.heaviest.weight, bests.heaviest.unit)) out.push("heaviest");
  if (set.weight && set.reps <= 12 && bests.one_rep_max) {
    const estimate = set.reps > 1 ? weight * (1 + set.reps / 30) : weight;
    if (estimate > kg(bests.one_rep_max.value, bests.one_rep_max.unit) + 0.05) out.push("one_rep_max");
  }
  if (bests.most_reps && set.reps > (bests.most_reps.reps ?? 0) && weight >= kg(bests.most_reps.weight, bests.most_reps.unit)) out.push("most_reps");
  return out;
}

/** Done sets, total volume (kg) and done-of-total for the session's summary line. */
export function sessionTotals(session: Pick<Session, "exercises">) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const done = sets.filter((set) => set.done);
  const volume = done.filter((set) => !set.warmup).reduce((sum, set) => sum + kg(set.weight, set.unit) * (set.reps ?? 0), 0);
  return { done: done.length, total: sets.length, volumeKg: Math.round(volume) };
}

/** "12,440 kg": volume, rounded to the nearest 10 above 1000. Without the unit for a tile that shows it apart. */
export function volumeText(volumeKg: number, withUnit = true) {
  const rounded = volumeKg >= 1000 ? Math.round(volumeKg / 10) * 10 : Math.round(volumeKg);
  return digits(withUnit ? `${rounded.toLocaleString("en-US")} kg` : rounded.toLocaleString("en-US"));
}

/** The unit for a new set when there is nothing to copy: the unit of the latest weigh-in, else kg. */
export function defaultUnit(weightLogs: Pick<WeightLog, "unit">[]): WeightUnit {
  return weightLogs[0]?.unit === "lb" ? "lb" : "kg";
}

export type Trend = { kind: MeasurementKind | "weight"; latest: { id: string; value: number; unit: string; at: string }; change: number | null; firstAt: string; points: number[]; count: number };

/**
 * One trend per measured kind (weight first, then the order of MEASUREMENT_KINDS): the latest value, the change
 * since the first entry in the same unit, and up to `points` values oldest to newest for a small chart.
 */
export function bodyTrends(measurements: BodyMeasurement[], weightLogs: WeightLog[], points = 8): Trend[] {
  const series: { kind: Trend["kind"]; rows: { id: string; value: number; unit: string; at: string }[] }[] = [
    { kind: "weight", rows: weightLogs.map((log) => ({ id: log.id, value: log.weight, unit: log.unit, at: log.logged_at })) },
    ...MEASUREMENT_KINDS.map((kind) => ({ kind, rows: measurements.filter((row) => row.kind === kind).map((row) => ({ id: row.id, value: row.value, unit: row.unit, at: row.measured_at })) }))
  ];
  return series
    .filter((entry) => entry.rows.length)
    .map(({ kind, rows }) => {
      const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at));
      const latest = sorted[sorted.length - 1];
      const sameUnit = sorted.filter((row) => row.unit === latest.unit);
      const change = sameUnit.length > 1 ? Math.round((latest.value - sameUnit[0].value) * 10) / 10 : null;
      return { kind, latest, change, firstAt: sameUnit[0].at, points: sameUnit.slice(-points).map((row) => row.value), count: rows.length };
    });
}

/**
 * Bar heights for a small trend chart. Body numbers move a little against a big base (84 → 82 kg), so bars start
 * from just under the lowest value instead of zero, or every bar would look the same.
 */
export function spread(points: number[]) {
  if (!points.length) return [];
  const low = Math.min(...points);
  const range = Math.max(...points) - low;
  const floor = range ? range * 0.35 : 1;
  return points.map((value) => Math.round((value - low + floor) * 1000) / 1000);
}

/** "+1.5", "−2", "±0". */
export function changeText(change: number | null, unit: string) {
  if (change === null) return null;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return ltr(`${sign}${trim(Math.abs(change))} ${unit}`);
}

/** Rows for one kind, newest first, for its history list. */
export function kindHistory(kind: Trend["kind"], measurements: BodyMeasurement[], weightLogs: WeightLog[]) {
  const rows = kind === "weight" ? weightLogs.map((log) => ({ id: log.id, value: log.weight, unit: log.unit as string, at: log.logged_at })) : measurements.filter((row) => row.kind === kind).map((row) => ({ id: row.id, value: row.value, unit: row.unit as string, at: row.measured_at }));
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

/** A body number with its unit, written with the chosen digits: "84.5 cm". */
export function amountText(value: number, unit: string) {
  return ltr(`${trim(value)} ${unit}`);
}

export function unitsFor(kind: Trend["kind"]): string[] {
  if (kind === "weight") return ["kg", "lb"];
  if (kind === "body_fat") return ["%"];
  return ["cm", "in"];
}

const en = {
  workouts: "Workouts", workoutsDetail: "Log sets, rest timer, your bests", startWorkout: "Start workout", resume: "Resume workout", repeat: "Repeat", inProgress: "In progress", history: "History", noSessions: "No workouts logged yet. Start one and add exercises from the library.",
  workout: "Workout", defaultName: "Workout", emptyWorkout: "Nothing here yet. Add your first exercise.", addExercise: "Add exercise", addSet: "Add set", finish: "Finish", finished: "Finished", discard: "Discard workout", discardTitle: "Discard this workout?", discardBody: "Its exercises and sets are deleted.", deleteWorkout: "Delete workout", deleteTitle: "Delete this workout?",
  rename: "Rename", namePh: "Name, e.g. Push day", set: "Set", sets: "Sets", previous: "Last", weight: "Weight", reps: "Reps", warmup: "Warm-up", warmupShort: "W", markWarmup: "Mark as warm-up", markWork: "Mark as work set", removeSet: "Remove set", removeExercise: "Remove exercise", removeExerciseTitle: "Remove this exercise?", removeExerciseBody: "Its sets in this workout are deleted.",
  rest: "Rest", restOff: "Off", restTimer: "Rest", skip: "Skip", restDone: "Rest over. Next set.", lastTime: "Last time", firstTime: "First time doing this one.", bests: "Your bests", heaviest: "Heaviest", oneRepMax: "Est. 1-rep max", mostReps: "Most reps", bestVolume: "Best session", recentSessions: "Recent sessions", noHistory: "Not done yet. Your sets and bests show here after a workout.",
  newRecord: "New best", records: { heaviest: "Heaviest", one_rep_max: "Est. max", most_reps: "Reps" } as { [key in BestKind]: string }, setsDone: (done: number, total: number) => `${digits(done)}/${digits(total)} sets`, volume: "Volume", duration: "Time", exercisesCount: (n: number) => `${digits(n)} exercise${n === 1 ? "" : "s"}`,
  pickExercise: "Add exercise", searchPh: "Search the library", custom: (name: string) => `Add “${name}” as your own`, added: "Added", openExercise: "About this exercise", unit: "Unit",
  measurements: "Body measurements", measurementsDetail: "Weight, waist, chest, arms… and the trend", addMeasurement: "Add measurement", value: "Value", logged: "Saved", noMeasurements: "Nothing measured yet. Pick what to measure and type the number.", since: (date: string) => `since ${date}`, entries: (n: number) => `${digits(n)} entr${n === 1 ? "y" : "ies"}`, deleteEntry: "Delete", deleteEntryTitle: "Delete this entry?", tapForHistory: "Tap one to see every entry.",
  kinds: { weight: "Weight", waist: "Waist", chest: "Chest", hips: "Hips", arm: "Arm", thigh: "Thigh", calf: "Calf", neck: "Neck", shoulders: "Shoulders", body_fat: "Body fat" } as { [key in Trend["kind"]]: string },
  couldNotLoad: "Couldn't load. Pull to try again.", badValue: "Type a number above zero."
};

const ar: typeof en = {
  workouts: "جلسات التمرين", workoutsDetail: "سجّل الجولات، مؤقت الراحة، أرقامك القياسية", startWorkout: "ابدأ تمرين", resume: "كمّل التمرين", repeat: "كرّره", inProgress: "شغّال", history: "السجل", noSessions: "ما سجلت تمرين للحين. ابدأ واحد وأضف تمارين من المكتبة.",
  workout: "التمرين", defaultName: "تمرين", emptyWorkout: "ما فيه شي للحين. أضف أول تمرين.", addExercise: "أضف تمرين", addSet: "أضف جولة", finish: "إنهاء", finished: "انتهى", discard: "إلغاء التمرين", discardTitle: "تلغي هذا التمرين؟", discardBody: "تنحذف تمارينه وجولاته.", deleteWorkout: "حذف التمرين", deleteTitle: "تحذف هذا التمرين؟",
  rename: "تغيير الاسم", namePh: "الاسم، مثل: يوم الصدر", set: "جولة", sets: "الجولات", previous: "آخر مرة", weight: "الوزن", reps: "العدّات", warmup: "إحماء", warmupShort: "إ", markWarmup: "اجعلها إحماء", markWork: "اجعلها جولة أساسية", removeSet: "احذف الجولة", removeExercise: "احذف التمرين", removeExerciseTitle: "تحذف هذا التمرين؟", removeExerciseBody: "تنحذف جولاته في هذا التمرين.",
  rest: "الراحة", restOff: "بدون", restTimer: "راحة", skip: "تخطَّ", restDone: "خلصت الراحة. الجولة الجاية.", lastTime: "آخر مرة", firstTime: "أول مرة تسوي هذا التمرين.", bests: "أرقامك القياسية", heaviest: "أثقل وزن", oneRepMax: "أقصى تكرار واحد (تقديري)", mostReps: "أكثر عدّات", bestVolume: "أفضل جلسة", recentSessions: "الجلسات الأخيرة", noHistory: "ما سويته للحين. جولاتك وأرقامك تظهر هنا بعد أول تمرين.",
  newRecord: "رقم جديد", records: { heaviest: "أثقل", one_rep_max: "الأقصى التقديري", most_reps: "عدّات" }, setsDone: (done: number, total: number) => `${digits(done)}/${digits(total)} جولات`, volume: "الحجم", duration: "المدة", exercisesCount: (n: number) => `${digits(n)} تمارين`,
  pickExercise: "أضف تمرين", searchPh: "ابحث في المكتبة", custom: (name: string) => `أضف «${name}» كتمرين خاص`, added: "انضاف", openExercise: "عن هذا التمرين", unit: "الوحدة",
  measurements: "قياسات الجسم", measurementsDetail: "الوزن، الخصر، الصدر، الذراع… وتغيّرها", addMeasurement: "أضف قياس", value: "القيمة", logged: "انحفظ", noMeasurements: "ما فيه قياسات للحين. اختر وش تقيس واكتب الرقم.", since: (date: string) => `من ${date}`, entries: (n: number) => `${digits(n)} قياسات`, deleteEntry: "حذف", deleteEntryTitle: "تحذف هذا القياس؟", tapForHistory: "اضغط على أي واحد يطلع لك كل قياساته.",
  kinds: { weight: "الوزن", waist: "الخصر", chest: "الصدر", hips: "الأرداف", arm: "الذراع", thigh: "الفخذ", calf: "السمانة", neck: "الرقبة", shoulders: "الأكتاف", body_fat: "نسبة الدهون" },
  couldNotLoad: "تعذر التحميل. اسحب للمحاولة مرة ثانية.", badValue: "اكتب رقم أكبر من صفر."
};

export const tt = isArabic ? ar : en;
