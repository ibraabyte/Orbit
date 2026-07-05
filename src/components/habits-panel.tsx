"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Check, Loader2, Plus } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getSupabase } from "@/lib/supabase";
import { formatShortDate, formatTime } from "@/lib/dates";
import { habitMomentum, habitProgress } from "@/lib/habits";
import type { Habit, HabitFrequency, HabitLog } from "@/lib/types";

export function HabitsPanel({
  userId,
  habits,
  habitLogs,
  onChanged,
  compact = false
}: {
  userId: string;
  habits: Habit[];
  habitLogs: HabitLog[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const visibleHabits = useMemo(() => habits.filter((habit) => !habit.archived_at), [habits]);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <ModuleCard title="Add habit" kicker="Small routines that should repeat without becoming tasks.">
          <HabitComposer userId={userId} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      <ModuleCard title={compact ? "Habits" : "Active habits"} kicker={`${visibleHabits.length} active routines`}>
        <HabitList userId={userId} habits={compact ? visibleHabits.slice(0, 5) : visibleHabits} habitLogs={habitLogs} onChanged={onChanged} />
      </ModuleCard>
    </div>
  );
}

function HabitComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [targetCount, setTargetCount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await getSupabase().from("habits").insert({
      user_id: userId,
      name,
      frequency,
      target_count: Number(targetCount || 1),
      color: null
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setName("");
    setFrequency("daily");
    setTargetCount("1");
    setSaving(false);
    await onSaved();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Habit" htmlFor="habit-name">
        <Input id="habit-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Walk, stretch, read, meal prep..." required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequency" htmlFor="habit-frequency">
          <Select id="habit-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as HabitFrequency)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </Field>
        <Field label="Target" htmlFor="habit-target">
          <Input id="habit-target" type="number" min="1" max="21" value={targetCount} onChange={(event) => setTargetCount(event.target.value)} required />
        </Field>
      </div>
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Add habit
      </Button>
    </form>
  );
}

function HabitList({
  userId,
  habits,
  habitLogs,
  onChanged
}: {
  userId: string;
  habits: Habit[];
  habitLogs: HabitLog[];
  onChanged: () => Promise<void> | void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!habits.length) return <EmptyState>No habits yet. Add one tiny routine you want Orbit to keep visible.</EmptyState>;

  async function checkIn(habit: Habit) {
    setSavingId(`check:${habit.id}`);
    setError(null);
    try {
      const { error: insertError } = await getSupabase().from("habit_logs").insert({
        user_id: userId,
        habit_id: habit.id,
        logged_at: new Date().toISOString(),
        note: null
      });
      if (insertError) throw new Error(insertError.message);
      await onChanged();
    } catch (habitError) {
      setError(habitError instanceof Error ? habitError.message : `${habit.name} could not be checked in.`);
    } finally {
      setSavingId(null);
    }
  }

  async function archive(habit: Habit) {
    setSavingId(`archive:${habit.id}`);
    setError(null);
    try {
      const { error: archiveError } = await getSupabase()
        .from("habits")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", habit.id)
        .eq("user_id", userId);
      if (archiveError) throw new Error(archiveError.message);
      await onChanged();
    } catch (habitError) {
      setError(habitError instanceof Error ? habitError.message : `${habit.name} could not be archived.`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {habits.map((habit) => {
        const progress = habitProgress(habit, habitLogs);
        const momentum = habitMomentum(habit, habitLogs);
        const latest = habitLogs.find((log) => log.habit_id === habit.id);
        const streakLabel = `${momentum.currentStreak} ${momentum.unit}${momentum.currentStreak === 1 ? "" : "s"}`;
        const complete = progress.completed >= progress.target;

        return (
          <div className="rounded-tile border border-hairline bg-surface p-3" key={habit.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{habit.name}</p>
                <p className="text-[12.5px] text-ink-muted">
                  {progress.completed}/{progress.target} this {habit.frequency === "daily" ? "day" : "week"}
                  {latest ? ` · Last ${formatShortDate(latest.logged_at)} ${formatTime(latest.logged_at)}` : ""}
                </p>
                <div className="mt-2">
                  <ProgressBar value={progress.completed} max={progress.target} ariaLabel={`${habit.name} progress`} tone={complete ? "success" : "accent"} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={momentum.currentStreak ? "success" : "neutral"}>{streakLabel}</Badge>
                <Button variant="primary" size="sm" type="button" onClick={() => checkIn(habit)} disabled={savingId === `check:${habit.id}`} aria-label={`Check in ${habit.name}`}>
                  {savingId === `check:${habit.id}` ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                </Button>
                <Button variant="secondary" size="sm" type="button" onClick={() => archive(habit)} disabled={savingId === `archive:${habit.id}`} aria-label={`Archive ${habit.name}`}>
                  {savingId === `archive:${habit.id}` ? <Loader2 size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
