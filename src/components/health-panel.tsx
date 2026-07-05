"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bed, Dumbbell, Loader2, Plus } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { StatTile, type StatTone } from "@/components/ui/stat-tile";
import { getSupabase } from "@/lib/supabase";
import { dateInputToIso, formatShortDate, formatTime, todayInputValue } from "@/lib/dates";
import { formatMacros } from "@/lib/food";
import { buildHealthSnapshot, macroTargetDelta, type HealthSnapshot, type MacroKey } from "@/lib/health";
import { formatSleepDuration } from "@/lib/sleep";
import { createTaggings, ensureTags, parseTagInput, tagsForTarget } from "@/lib/tag-actions";
import type { Meal, SleepLog, Tag, Tagging, WeightLog, WeightUnit, Workout } from "@/lib/types";

type HealthMode = "meal" | "weight" | "workout" | "sleep";

const HEALTH_MODES: { value: HealthMode; label: string }[] = [
  { value: "meal", label: "Meal" },
  { value: "weight", label: "Weight" },
  { value: "workout", label: "Workout" },
  { value: "sleep", label: "Sleep" }
];

export function HealthPanel({
  userId,
  meals,
  weightLogs,
  workouts,
  sleepLogs,
  tags = [],
  taggings = [],
  onChanged,
  preferredWeightUnit = "kg",
  dailyCalorieTarget = null,
  dailyProteinTarget = null,
  dailyCarbsTarget = null,
  dailyFatTarget = null,
  weeklyWorkoutTarget = 150
}: {
  userId: string;
  meals: Meal[];
  weightLogs: WeightLog[];
  workouts: Workout[];
  sleepLogs: SleepLog[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
  preferredWeightUnit?: WeightUnit;
  dailyCalorieTarget?: number | null;
  dailyProteinTarget?: number | null;
  dailyCarbsTarget?: number | null;
  dailyFatTarget?: number | null;
  weeklyWorkoutTarget?: number;
}) {
  const snapshot = buildHealthSnapshot(
    { meals, workouts, weightLogs, sleepLogs },
    { dailyCalorieTarget, dailyProteinTarget, dailyCarbsTarget, dailyFatTarget, weeklyWorkoutTarget }
  );

  return (
    <div className="flex flex-col gap-4">
      <ModuleCard title="Log health" kicker="Manual entries keep V1 fast and reliable.">
        <HealthComposer userId={userId} preferredWeightUnit={preferredWeightUnit} onSaved={onChanged} />
      </ModuleCard>
      <ModuleCard title="Recent health" kicker={`${meals.length} meals, ${workouts.length} workouts, ${weightLogs.length} weights, ${sleepLogs.length} sleep logs`}>
        <HealthRecent snapshot={snapshot} meals={meals} weightLogs={weightLogs} workouts={workouts} sleepLogs={sleepLogs} tags={tags} taggings={taggings} />
      </ModuleCard>
    </div>
  );
}

function HealthComposer({
  userId,
  preferredWeightUnit,
  onSaved
}: {
  userId: string;
  preferredWeightUnit: WeightUnit;
  onSaved: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<HealthMode>("meal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<WeightUnit>(preferredWeightUnit);
  const [workoutType, setWorkoutType] = useState("");
  const [duration, setDuration] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [sleepQuality, setSleepQuality] = useState("3");
  const [sleepDate, setSleepDate] = useState(todayInputValue().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [loggedAt, setLoggedAt] = useState(todayInputValue());

  useEffect(() => {
    setUnit(preferredWeightUnit);
  }, [preferredWeightUnit]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = getSupabase();
    const iso = dateInputToIso(loggedAt) ?? new Date().toISOString();
    const parsedTags = parseTagInput(tagInput);
    let rollback: (() => Promise<void>) | null = null;
    let writesComplete = false;

    try {
      if (mode === "meal") {
        const { data: meal, error: mealError } = await supabase
          .from("meals")
          .insert({
            user_id: userId,
            name,
            calories: Number(calories || 0),
            protein_g: protein ? Number(protein) : null,
            carbs_g: carbs ? Number(carbs) : null,
            fat_g: fat ? Number(fat) : null,
            logged_at: iso
          })
          .select()
          .single();
        if (mealError || !meal) throw new Error(mealError?.message ?? "Meal could not be logged.");
        rollback = async () => {
          await supabase.from("meals").delete().eq("id", meal.id).eq("user_id", userId);
        };
        const tags = await ensureTags(userId, parsedTags, supabase);
        await createTaggings(userId, "meal", meal.id, tags, supabase);
        rollback = null;
        setName("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
      }

      if (mode === "weight") {
        const { error: weightError } = await supabase.from("weight_logs").insert({
          user_id: userId,
          weight: Number(weight),
          unit,
          logged_at: iso
        });
        if (weightError) throw new Error(weightError.message);
        setWeight("");
      }

      if (mode === "workout") {
        const { data: workout, error: workoutError } = await supabase
          .from("workouts")
          .insert({
            user_id: userId,
            type: workoutType,
            duration_minutes: duration ? Number(duration) : null,
            calories: calories ? Number(calories) : null,
            notes: notes.trim() || null,
            logged_at: iso
          })
          .select()
          .single();
        if (workoutError || !workout) throw new Error(workoutError?.message ?? "Workout could not be logged.");
        rollback = async () => {
          await supabase.from("workouts").delete().eq("id", workout.id).eq("user_id", userId);
        };
        const tags = await ensureTags(userId, parsedTags, supabase);
        await createTaggings(userId, "workout", workout.id, tags, supabase);
        rollback = null;
        setWorkoutType("");
        setDuration("");
        setCalories("");
        setNotes("");
      }

      if (mode === "sleep") {
        const { data: sleepLog, error: sleepError } = await supabase
          .from("sleep_logs")
          .insert({
            user_id: userId,
            sleep_date: sleepDate,
            duration_minutes: Math.round(Number(sleepHours || 0) * 60),
            quality: sleepQuality ? Number(sleepQuality) : null,
            bedtime_at: null,
            woke_at: null,
            note: notes.trim() || null
          })
          .select()
          .single();
        if (sleepError || !sleepLog) throw new Error(sleepError?.message ?? "Sleep could not be logged.");
        rollback = async () => {
          await supabase.from("sleep_logs").delete().eq("id", sleepLog.id).eq("user_id", userId);
        };
        const tags = await ensureTags(userId, parsedTags, supabase);
        await createTaggings(userId, "sleep", sleepLog.id, tags, supabase);
        rollback = null;
        setSleepHours("");
        setSleepQuality("3");
        setNotes("");
      }

      writesComplete = true;
      setTagInput("");
      await onSaved();
    } catch (healthError) {
      if (rollback && !writesComplete) await rollback().catch(() => undefined);
      setError(healthError instanceof Error ? healthError.message : "Health log could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Segmented ariaLabel="Health log type" size="sm" options={HEALTH_MODES} value={mode} onChange={setMode} />

      {mode === "meal" ? (
        <>
          <Field label="Meal" htmlFor="meal-name">
            <Input id="meal-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="meal-calories" label="Calories" value={calories} onChange={setCalories} required />
            <NumberField id="meal-protein" label="Protein g" value={protein} onChange={setProtein} />
            <NumberField id="meal-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
            <NumberField id="meal-fat" label="Fat g" value={fat} onChange={setFat} />
          </div>
        </>
      ) : null}

      {mode === "weight" ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberField id="weight-value" label="Weight" value={weight} onChange={setWeight} required />
          <Field label="Unit" htmlFor="weight-unit">
            <Select id="weight-unit" value={unit} onChange={(event) => setUnit(event.target.value as WeightUnit)}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </Select>
          </Field>
        </div>
      ) : null}

      {mode === "workout" ? (
        <>
          <Field label="Workout" htmlFor="workout-type">
            <Input id="workout-type" value={workoutType} onChange={(event) => setWorkoutType(event.target.value)} placeholder="Push, pull, run, mobility..." required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="workout-duration" label="Minutes" value={duration} onChange={setDuration} />
            <NumberField id="workout-calories" label="Calories" value={calories} onChange={setCalories} />
          </div>
          <Field label="Notes" htmlFor="workout-notes">
            <Textarea id="workout-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </>
      ) : null}

      {mode === "sleep" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="sleep-hours" label="Hours slept" value={sleepHours} onChange={setSleepHours} required />
            <Field label="Quality" htmlFor="sleep-quality">
              <Select id="sleep-quality" value={sleepQuality} onChange={(event) => setSleepQuality(event.target.value)}>
                <option value="1">1 - poor</option>
                <option value="2">2</option>
                <option value="3">3 - okay</option>
                <option value="4">4</option>
                <option value="5">5 - great</option>
              </Select>
            </Field>
          </div>
          <Field label="Sleep date" htmlFor="sleep-date">
            <Input id="sleep-date" type="date" value={sleepDate} onChange={(event) => setSleepDate(event.target.value)} required />
          </Field>
          <Field label="Notes" htmlFor="sleep-notes">
            <Textarea id="sleep-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </>
      ) : (
        <Field label="Logged at" htmlFor="health-logged-at">
          <Input id="health-logged-at" type="datetime-local" value={loggedAt} onChange={(event) => setLoggedAt(event.target.value)} />
        </Field>
      )}

      {mode !== "weight" ? (
        <Field label="Tags" htmlFor="health-tags">
          <Input
            id="health-tags"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder={mode === "sleep" ? "recovery, travel, stress" : "protein, legs, meal-prep"}
          />
        </Field>
      ) : null}

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : mode === "workout" ? <Dumbbell size={16} aria-hidden="true" /> : mode === "sleep" ? <Bed size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Log {mode}
      </Button>
    </form>
  );
}

function NumberField({
  id,
  label,
  value,
  required,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.1" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </Field>
  );
}

function HealthRecent({
  snapshot,
  meals,
  weightLogs,
  workouts,
  sleepLogs,
  tags,
  taggings
}: {
  snapshot: HealthSnapshot;
  meals: Meal[];
  weightLogs: WeightLog[];
  workouts: Workout[];
  sleepLogs: SleepLog[];
  tags: Tag[];
  taggings: Tagging[];
}) {
  const rows = [
    ...meals.slice(0, 6).map((meal) => ({
      id: `meal-${meal.id}`,
      title: meal.name,
      meta: [`${meal.calories} calories`, formatMacros({ protein: meal.protein_g, carbs: meal.carbs_g, fat: meal.fat_g }), `${formatShortDate(meal.logged_at)} ${formatTime(meal.logged_at)}`]
        .filter(Boolean)
        .join(" · "),
      badge: "meal",
      tags: tagsForTarget(tags, taggings, "meal", meal.id)
    })),
    ...workouts.slice(0, 4).map((workout) => ({
      id: `workout-${workout.id}`,
      title: workout.type,
      meta: `${workout.duration_minutes ?? 0} min · ${formatShortDate(workout.logged_at)} ${formatTime(workout.logged_at)}`,
      badge: "workout",
      tags: tagsForTarget(tags, taggings, "workout", workout.id)
    })),
    ...weightLogs.slice(0, 3).map((log) => ({
      id: `weight-${log.id}`,
      title: `${log.weight} ${log.unit}`,
      meta: `${formatShortDate(log.logged_at)} ${formatTime(log.logged_at)}`,
      badge: "weight",
      tags: [] as Tag[]
    })),
    ...sleepLogs.slice(0, 4).map((log) => ({
      id: `sleep-${log.id}`,
      title: formatSleepDuration(log.duration_minutes),
      meta: `${formatShortDate(`${log.sleep_date}T12:00:00`)} · quality ${log.quality ?? "-"}/5`,
      badge: "sleep",
      tags: tagsForTarget(tags, taggings, "sleep", log.id)
    }))
  ].slice(0, 10);

  const logList = rows.length ? (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div className="rounded-tile border border-hairline bg-surface p-3" key={row.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{row.title}</p>
              <p className="text-[12.5px] text-ink-muted">{row.meta}</p>
              {row.tags.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {row.tags.map((tag) => (
                    <Badge key={tag.id}>#{tag.name}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <Badge tone={logTone(row.badge)}>{row.badge}</Badge>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState>No health logs yet. Start with one meal, weight entry, workout, or sleep log.</EmptyState>
  );

  return (
    <div className="flex flex-col gap-4">
      <HealthSnapshotTiles snapshot={snapshot} />
      {logList}
    </div>
  );
}

function HealthSnapshotTiles({ snapshot }: { snapshot: HealthSnapshot }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile label="Calories" value={snapshot.todayCalories} hint={calorieDetail(snapshot)} tone={snapshot.calorieDelta !== null && Math.abs(snapshot.calorieDelta) >= 250 ? "urgent" : "neutral"} />
      <StatTile label="Macros" value={macroValue(snapshot)} hint={macroDetail(snapshot)} tone={macroTargetTone(snapshot)} />
      <StatTile label="Workout" value={`${snapshot.workoutMinutes}m`} hint={snapshot.workoutRemaining ? `${snapshot.workoutRemaining}m left of ${snapshot.workoutTarget}` : `${snapshot.workoutTarget}m target met`} tone={snapshot.workoutRemaining ? "urgent" : "success"} />
      <StatTile label="Sleep" value={formatSleepDuration(snapshot.sleepAverageMinutes)} hint={`${snapshot.sleepNights} night${snapshot.sleepNights === 1 ? "" : "s"} logged`} tone={snapshot.sleepNights < 3 ? "urgent" : "success"} />
      <StatTile label="Weight" value={snapshot.latestWeight === null ? "open" : `${snapshot.latestWeight} ${snapshot.weightUnit ?? ""}`} hint={weightDetail(snapshot)} />
    </div>
  );
}

function logTone(badge: string): BadgeTone {
  if (badge === "workout") return "success";
  if (badge === "sleep") return "accent";
  return "neutral";
}

function weightDetail(snapshot: HealthSnapshot) {
  if (snapshot.latestWeight === null) return "No weight logs";
  if (snapshot.weightDelta === null) return "No prior entry";
  const prefix = snapshot.weightDelta > 0 ? "+" : "";
  return `${prefix}${snapshot.weightDelta} ${snapshot.weightUnit ?? ""} from prior`;
}

function calorieDetail(snapshot: HealthSnapshot) {
  if (snapshot.calorieTarget === null || snapshot.calorieDelta === null) return "Logged today";
  if (snapshot.calorieDelta > 0) return `${snapshot.calorieDelta} over ${snapshot.calorieTarget}`;
  if (snapshot.calorieDelta < 0) return `${Math.abs(snapshot.calorieDelta)} left of ${snapshot.calorieTarget}`;
  return `${snapshot.calorieTarget} target met`;
}

function macroValue(snapshot: HealthSnapshot) {
  return `${roundMacro(snapshot.todayMacros.protein)}p ${roundMacro(snapshot.todayMacros.carbs)}c ${roundMacro(snapshot.todayMacros.fat)}f`;
}

function macroDetail(snapshot: HealthSnapshot) {
  const targets = macroKeys.filter((key) => snapshot.macroTargets[key] !== null);
  if (!targets.length) return "Protein, carbs, fat logged today";

  const mostBehind = targets
    .map((key) => ({
      key,
      delta: macroTargetDelta(snapshot.todayMacros[key], snapshot.macroTargets[key])
    }))
    .filter((item): item is { key: MacroKey; delta: number } => item.delta !== null)
    .sort((a, b) => a.delta - b.delta)[0];

  if (!mostBehind) return "Macro targets set";
  if (mostBehind.delta < 0) return `${Math.abs(mostBehind.delta)}g ${macroLabel(mostBehind.key)} left`;
  if (mostBehind.delta > 0) return `${mostBehind.delta}g ${macroLabel(mostBehind.key)} over`;
  return `${macroLabel(mostBehind.key)} target met`;
}

function macroTargetTone(snapshot: HealthSnapshot): StatTone {
  const targets = macroKeys.filter((key) => snapshot.macroTargets[key] !== null);
  if (!targets.length) return "neutral";
  return targets.some((key) => {
    const delta = macroTargetDelta(snapshot.todayMacros[key], snapshot.macroTargets[key]);
    return delta !== null && delta < 0;
  })
    ? "urgent"
    : "success";
}

function macroLabel(key: MacroKey) {
  return { protein: "protein", carbs: "carbs", fat: "fat" }[key];
}

function roundMacro(value: number) {
  return Number.isInteger(value) ? value : Number(value.toFixed(1));
}

const macroKeys: MacroKey[] = ["protein", "carbs", "fat"];
