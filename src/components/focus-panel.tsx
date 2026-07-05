"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Loader2, Timer, X } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { dateInputToIso, formatShortDate, formatTime, todayInputValue } from "@/lib/dates";
import { focusSummary, formatFocusDuration } from "@/lib/focus";
import { getSupabase } from "@/lib/supabase";
import { createTaggings, ensureTags, parseTagInput, tagsForTarget } from "@/lib/tag-actions";
import type { FocusSession, FocusSessionStatus, Tag, Tagging, Task } from "@/lib/types";

type FocusMode = "completed" | "planned";

const FOCUS_MODES: { value: FocusMode; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "planned", label: "Planned" }
];

export function FocusPanel({
  userId,
  sessions,
  tasks,
  tags = [],
  taggings = [],
  onChanged,
  compact = false
}: {
  userId: string;
  sessions: FocusSession[];
  tasks: Task[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const summary = useMemo(() => focusSummary({ focusSessions: sessions }), [sessions]);

  return (
    <div className="flex flex-col gap-4">
      <ModuleCard title="Log focus" kicker="Plan blocks or record completed deep work.">
        <FocusComposer userId={userId} tasks={tasks} onSaved={onChanged} />
      </ModuleCard>
      <ModuleCard title="Focus view" kicker={`${formatFocusDuration(summary.weekMinutes)} this week, ${summary.plannedUpcoming.length} planned`}>
        <FocusRecent userId={userId} sessions={sessions} tags={tags} taggings={taggings} onChanged={onChanged} />
      </ModuleCard>
    </div>
  );
}

function FocusComposer({ userId, tasks, onSaved }: { userId: string; tasks: Task[]; onSaved: () => Promise<void> | void }) {
  const openTasks = tasks.filter((task) => task.status === "open").slice(0, 40);
  const [mode, setMode] = useState<FocusMode>("completed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("50");
  const [startedAt, setStartedAt] = useState(todayInputValue());
  const [energy, setEnergy] = useState("3");
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedDuration = Number(duration || 0);
      const startedIso = dateInputToIso(startedAt) ?? new Date().toISOString();
      const endedAt = mode === "completed" ? new Date(new Date(startedIso).getTime() + parsedDuration * 60_000).toISOString() : null;
      const selectedTask = openTasks.find((task) => task.id === taskId);
      const parsedTags = parseTagInput(tagInput);
      const { data, error: insertError } = await getSupabase()
        .from("focus_sessions")
        .insert({
          user_id: userId,
          task_id: taskId || null,
          title: title.trim() || selectedTask?.title || "Focus session",
          duration_minutes: parsedDuration,
          started_at: startedIso,
          ended_at: endedAt,
          status: mode,
          energy: mode === "completed" && energy ? Number(energy) : null,
          note: note.trim() || null
        })
        .select()
        .single();
      if (insertError) throw new Error(insertError.message);
      if (data) {
        const tags = await ensureTags(userId, parsedTags);
        await createTaggings(userId, "focus_session", data.id, tags);
      }

      setTitle("");
      setDuration("50");
      setEnergy("3");
      setTaskId("");
      setNote("");
      setTagInput("");
      await onSaved();
    } catch (focusError) {
      setError(focusError instanceof Error ? focusError.message : "Focus session save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Segmented ariaLabel="Focus session type" size="sm" options={FOCUS_MODES} value={mode} onChange={setMode} />

      <Field label="Title" htmlFor="focus-title">
        <Input id="focus-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Deep work, study, admin..." />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField id="focus-duration" label="Minutes" value={duration} onChange={setDuration} required />
        <Field label={mode === "completed" ? "Started" : "Starts"} htmlFor="focus-started-at">
          <Input id="focus-started-at" type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
        </Field>
      </div>

      <Field label="Task" htmlFor="focus-task">
        <Select id="focus-task" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
          <option value="">No linked task</option>
          {openTasks.map((task) => (
            <option value={task.id} key={task.id}>
              {task.title}
            </option>
          ))}
        </Select>
      </Field>

      {mode === "completed" ? (
        <Field label="Energy" htmlFor="focus-energy">
          <Select id="focus-energy" value={energy} onChange={(event) => setEnergy(event.target.value)}>
            <option value="1">1 - low</option>
            <option value="2">2</option>
            <option value="3">3 - steady</option>
            <option value="4">4</option>
            <option value="5">5 - sharp</option>
          </Select>
        </Field>
      ) : null}

      <Field label="Tags" htmlFor="focus-tags">
        <Input id="focus-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="work, study, admin" />
      </Field>

      <Field label="Note" htmlFor="focus-note">
        <Textarea id="focus-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Timer size={16} aria-hidden="true" />}
        Save focus
      </Button>
    </form>
  );
}

function FocusRecent({
  userId,
  sessions,
  tags,
  taggings,
  onChanged
}: {
  userId: string;
  sessions: FocusSession[];
  tags: Tag[];
  taggings: Tagging[];
  onChanged: () => Promise<void> | void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const summary = useMemo(() => focusSummary({ focusSessions: sessions }), [sessions]);
  const visible = [...summary.plannedOverdue, ...summary.plannedUpcoming, ...sessions.filter((session) => session.status === "completed").slice(0, 8)].slice(0, 12);

  async function updateStatus(session: FocusSession, status: FocusSessionStatus) {
    setSavingId(session.id);
    const endedAt = status === "completed" ? new Date(new Date(session.started_at).getTime() + session.duration_minutes * 60_000).toISOString() : null;
    await getSupabase().from("focus_sessions").update({ status, ended_at: endedAt }).eq("id", session.id).eq("user_id", userId);
    setSavingId(null);
    await onChanged();
  }

  if (!visible.length) return <EmptyState>No focus sessions yet. Plan one block or log one completed session.</EmptyState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FocusStat label="Today" value={formatFocusDuration(summary.todayMinutes)} />
        <FocusStat label="This week" value={formatFocusDuration(summary.weekMinutes)} />
        <FocusStat label="Sessions" value={summary.sessionsLogged} />
        <FocusStat label="Energy" value={summary.averageEnergy ?? "-"} />
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.map((session) => {
          const sessionTags = tagsForTarget(tags, taggings, "focus_session", session.id);
          return (
            <div className="rounded-tile border border-hairline bg-surface p-3" key={session.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{session.title}</p>
                  <p className="text-[12.5px] text-ink-muted">
                    {formatFocusDuration(session.duration_minutes)} · {formatShortDate(session.started_at)} {formatTime(session.started_at)}
                    {session.energy ? ` · energy ${session.energy}/5` : ""}
                  </p>
                  {sessionTags.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {sessionTags.map((tag) => (
                        <Badge key={tag.id}>#{tag.name}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                {session.status === "planned" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="primary" size="sm" type="button" onClick={() => updateStatus(session, "completed")} disabled={savingId === session.id} aria-label={`Complete ${session.title}`}>
                      {savingId === session.id ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    </Button>
                    <Button variant="secondary" size="sm" type="button" onClick={() => updateStatus(session, "cancelled")} disabled={savingId === session.id} aria-label={`Cancel ${session.title}`}>
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <Badge tone="success">focus</Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FocusStat({ label, value }: { label: string; value: string | number }) {
  return <StatTile label={label} value={value} />;
}

function NumberField({ id, label, value, required, onChange }: { id: string; label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} type="number" inputMode="decimal" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </Field>
  );
}
