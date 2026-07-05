"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Check, Flag, Loader2, Plus, RotateCcw } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatShortDate } from "@/lib/dates";
import { activeGoals, goalProgress, milestonesForGoal } from "@/lib/goals";
import { getSupabase } from "@/lib/supabase";
import type { Goal, GoalMilestone } from "@/lib/types";

export function GoalsPanel({
  userId,
  goals,
  milestones,
  onChanged,
  compact = false
}: {
  userId: string;
  goals: Goal[];
  milestones: GoalMilestone[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const visibleGoals = useMemo(() => activeGoals(goals), [goals]);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <ModuleCard title="Add goal" kicker="Create a longer-term outcome and break it into milestones.">
          <GoalComposer userId={userId} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      <ModuleCard title={compact ? "Goals" : "Active goals"} kicker={`${visibleGoals.length} active outcomes`}>
        <GoalList userId={userId} goals={compact ? visibleGoals.slice(0, 4) : goals.filter((goal) => goal.status !== "archived")} milestones={milestones} onChanged={onChanged} compact={compact} />
      </ModuleCard>
    </div>
  );
}

function GoalComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [targetAt, setTargetAt] = useState("");
  const [milestoneInput, setMilestoneInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = getSupabase();
    let goalId: string | null = null;
    let writesComplete = false;

    try {
      const { data: goal, error: goalError } = await supabase
        .from("goals")
        .insert({
          user_id: userId,
          title,
          notes: notes.trim() || null,
          status: "active",
          target_at: targetAt || null
        })
        .select()
        .single();

      if (goalError || !goal) throw new Error(goalError?.message ?? "Goal could not be saved.");
      goalId = goal.id;

      const milestones = parseMilestones(milestoneInput);
      if (milestones.length) {
        const { error: milestoneError } = await supabase.from("goal_milestones").insert(
          milestones.map((milestone) => ({
            user_id: userId,
            goal_id: goal.id,
            title: milestone,
            completed_at: null
          }))
        );
        if (milestoneError) throw new Error(milestoneError.message);
      }

      writesComplete = true;
      setTitle("");
      setNotes("");
      setTargetAt("");
      setMilestoneInput("");
      await onSaved();
    } catch (goalError) {
      if (goalId && !writesComplete) {
        await supabase.from("goal_milestones").delete().eq("goal_id", goalId).eq("user_id", userId);
        await supabase.from("goals").delete().eq("id", goalId).eq("user_id", userId);
      }
      setError(goalError instanceof Error ? goalError.message : "Goal could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Goal" htmlFor="goal-title">
        <Input id="goal-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cut to 80kg, launch portfolio, save for travel..." required />
      </Field>
      <Field label="Notes" htmlFor="goal-notes">
        <Textarea id="goal-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Field label="Target date" htmlFor="goal-target">
        <Input id="goal-target" type="date" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} />
      </Field>
      <Field label="Milestones" htmlFor="goal-milestones">
        <Textarea id="goal-milestones" value={milestoneInput} onChange={(event) => setMilestoneInput(event.target.value)} placeholder="One milestone per line" />
      </Field>
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Add goal
      </Button>
    </form>
  );
}

function GoalList({
  userId,
  goals,
  milestones,
  onChanged,
  compact
}: {
  userId: string;
  goals: Goal[];
  milestones: GoalMilestone[];
  onChanged: () => Promise<void> | void;
  compact: boolean;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!goals.length) return <EmptyState>No goals yet. Add one outcome you want Orbit to keep visible.</EmptyState>;

  async function setGoalStatus(goal: Goal, status: Goal["status"]) {
    const key = `goal:${goal.id}`;
    setSavingKey(key);
    setError(null);
    try {
      const { error: updateError } = await getSupabase().from("goals").update({ status }).eq("id", goal.id).eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      await onChanged();
    } catch (goalError) {
      setError(goalError instanceof Error ? goalError.message : "Goal could not be updated.");
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleMilestone(milestone: GoalMilestone) {
    const key = `milestone:${milestone.id}`;
    setSavingKey(key);
    setError(null);
    try {
      const { error: updateError } = await getSupabase()
        .from("goal_milestones")
        .update({ completed_at: milestone.completed_at ? null : new Date().toISOString() })
        .eq("id", milestone.id)
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      await onChanged();
    } catch (milestoneError) {
      setError(milestoneError instanceof Error ? milestoneError.message : "Milestone could not be updated.");
    } finally {
      setSavingKey(null);
    }
  }

  async function addMilestone(goal: Goal, title: string) {
    if (!title.trim()) return;
    const key = `new-milestone:${goal.id}`;
    setSavingKey(key);
    setError(null);
    try {
      const { error: insertError } = await getSupabase().from("goal_milestones").insert({
        user_id: userId,
        goal_id: goal.id,
        title: title.trim(),
        completed_at: null
      });
      if (insertError) throw new Error(insertError.message);
      await onChanged();
    } catch (milestoneError) {
      setError(milestoneError instanceof Error ? milestoneError.message : "Milestone could not be added.");
      throw milestoneError;
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {goals.map((goal) => {
        const progress = goalProgress(goal, milestones);
        const goalMilestones = milestonesForGoal(goal.id, milestones);

        return (
          <GoalRow
            key={goal.id}
            goal={goal}
            milestones={compact ? goalMilestones.slice(0, 3) : goalMilestones}
            progress={progress}
            compact={compact}
            onStatus={setGoalStatus}
            onMilestone={toggleMilestone}
            onAddMilestone={addMilestone}
            savingKey={savingKey}
          />
        );
      })}
    </div>
  );
}

function GoalRow({
  goal,
  milestones,
  progress,
  compact,
  onStatus,
  onMilestone,
  onAddMilestone,
  savingKey
}: {
  goal: Goal;
  milestones: GoalMilestone[];
  progress: ReturnType<typeof goalProgress>;
  compact: boolean;
  onStatus: (goal: Goal, status: Goal["status"]) => Promise<void>;
  onMilestone: (milestone: GoalMilestone) => Promise<void>;
  onAddMilestone: (goal: Goal, title: string) => Promise<void>;
  savingKey: string | null;
}) {
  const [newMilestone, setNewMilestone] = useState("");

  async function submitMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onAddMilestone(goal, newMilestone);
      setNewMilestone("");
    } catch {
      // The parent renders the action error.
    }
  }

  return (
    <div className="rounded-tile border border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">{goal.title}</p>
          <p className="text-[12.5px] text-ink-muted">
            {progress.percent}% complete
            {goal.target_at ? ` · Target ${formatShortDate(goal.target_at)}` : ""}
            {goal.status !== "active" ? ` · ${goal.status}` : ""}
          </p>
          <div className="mt-2">
            <ProgressBar value={progress.percent} max={100} ariaLabel={`${goal.title} progress`} tone={progress.percent >= 100 ? "success" : "accent"} />
          </div>
          {goal.notes ? <p className="mt-1 text-[12px] text-ink-muted">{goal.notes}</p> : null}
          {milestones.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {milestones.map((milestone) => (
                <button
                  type="button"
                  key={milestone.id}
                  disabled={savingKey === `milestone:${milestone.id}`}
                  onClick={() => onMilestone(milestone)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition-colors hover:bg-surface-inset ${milestone.completed_at ? "text-ink-muted line-through" : "text-ink"}`}
                >
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${milestone.completed_at ? "bg-accent text-accent-ink" : "border border-hairline"}`}>
                    {savingKey === `milestone:${milestone.id}` ? <Loader2 size={12} aria-hidden="true" /> : milestone.completed_at ? <Check size={12} aria-hidden="true" strokeWidth={3} /> : null}
                  </span>
                  {milestone.title}
                </button>
              ))}
            </div>
          ) : null}
          {!compact ? (
            <form className="mt-2 flex items-center gap-2" onSubmit={submitMilestone}>
              <div className="flex-1">
                <Input value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="Add milestone" aria-label={`Add milestone to ${goal.title}`} />
              </div>
              <Button variant="secondary" type="submit" disabled={savingKey === `new-milestone:${goal.id}`}>
                {savingKey === `new-milestone:${goal.id}` ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                Add
              </Button>
            </form>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {goal.status === "completed" ? (
            <Button variant="secondary" size="sm" type="button" onClick={() => onStatus(goal, "active")} disabled={savingKey === `goal:${goal.id}`} aria-label="Reopen goal">
              {savingKey === `goal:${goal.id}` ? <Loader2 size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
            </Button>
          ) : (
            <Button variant="primary" size="sm" type="button" onClick={() => onStatus(goal, "completed")} disabled={savingKey === `goal:${goal.id}`} aria-label="Complete goal">
              {savingKey === `goal:${goal.id}` ? <Loader2 size={16} aria-hidden="true" /> : <Flag size={16} aria-hidden="true" />}
            </Button>
          )}
          <Button variant="secondary" size="sm" type="button" onClick={() => onStatus(goal, "archived")} disabled={savingKey === `goal:${goal.id}`} aria-label="Archive goal">
            {savingKey === `goal:${goal.id}` ? <Loader2 size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function parseMilestones(input: string) {
  return input
    .split(/\n|,/)
    .map((milestone) => milestone.trim())
    .filter(Boolean);
}
