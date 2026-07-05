"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bell, Check, Loader2, Plus, RotateCcw, Search } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { scheduledReminders } from "@/lib/dashboard";
import { dateInputToIso, formatShortDate, formatTime, todayInputValue } from "@/lib/dates";
import { postponeReminderAt, SNOOZE_PRESETS, snoozePresetLabel, type SnoozePreset } from "@/lib/reminders";
import { completeTaskWithReminders } from "@/lib/task-completion";
import { createTaggings, ensureTags, parseTagInput, tagsForTarget, targetMatchesTag, textMatchesQuery } from "@/lib/tag-actions";
import type { RecurrenceRule, Reminder, Tag, Tagging, Task, TaskPriority } from "@/lib/types";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function TaskManager({
  userId,
  tasks,
  reminders,
  tags = [],
  taggings = [],
  onChanged,
  compact = false
}: {
  userId: string;
  tasks: Task[];
  reminders: Reminder[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const openTasks = useMemo(() => tasks.filter((task) => task.status === "open"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((task) => task.status === "done").slice(0, 8), [tasks]);
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const filteredTasks = useMemo(
    () =>
      [...openTasks, ...doneTasks].filter(
        (task) => textMatchesQuery(query, [task.title, task.notes]) && targetMatchesTag(taggings, tagId, "task", task.id)
      ),
    [doneTasks, openTasks, query, tagId, taggings]
  );

  return (
    <div className="flex flex-col gap-4">
      <ModuleCard title="Add task" kicker="Due date and reminder can be separate.">
        <TaskComposer userId={userId} onSaved={onChanged} />
      </ModuleCard>
      <ModuleCard title="Task list" kicker={`${openTasks.length} open, ${doneTasks.length} recently done`}>
        {!compact ? (
          <div className="mb-3 flex flex-col gap-2">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks and notes..."
                aria-label="Search tasks"
                className="pl-9"
              />
            </div>
            <Select value={tagId ?? ""} onChange={(event) => setTagId(event.target.value || null)} aria-label="Filter by tag">
              <option value="">All tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  #{tag.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <TaskList tasks={compact ? openTasks.slice(0, 5) : filteredTasks} tags={tags} taggings={taggings} onChanged={onChanged} />
      </ModuleCard>
      {!compact ? (
        <ModuleCard title="Standalone reminder" kicker="For things that do not need a task.">
          <ReminderComposer userId={userId} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      {!compact ? (
        <ModuleCard title="Scheduled reminders" kicker="Push sends when your server cron runs.">
          <ReminderList reminders={reminders} tasks={tasks} onChanged={onChanged} />
        </ModuleCard>
      ) : null}
    </div>
  );
}

function TaskComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [recurrence, setRecurrence] = useState<RecurrenceRule | "">("");
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = getSupabase();
    let taskId: string | null = null;
    let writesComplete = false;

    try {
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title,
          notes: notes.trim() || null,
          status: "open",
          priority,
          due_at: dateInputToIso(dueAt),
          reminder_at: dateInputToIso(reminderAt),
          recurrence: recurrence || null
        })
        .select()
        .single();

      if (taskError || !task) throw new Error(taskError?.message ?? "Task could not be saved.");
      taskId = task.id;

      if (reminderAt) {
        const { error: reminderError } = await supabase.from("reminders").insert({
          user_id: userId,
          task_id: task.id,
          title,
          body: notes.trim() || null,
          remind_at: dateInputToIso(reminderAt) ?? new Date().toISOString(),
          status: "scheduled"
        });
        if (reminderError) throw new Error(reminderError.message);
      }

      const tags = await ensureTags(userId, parseTagInput(tagInput), supabase);
      await createTaggings(userId, "task", task.id, tags, supabase);
      writesComplete = true;

      setTitle("");
      setNotes("");
      setDueAt("");
      setReminderAt("");
      setPriority("normal");
      setRecurrence("");
      setTagInput("");
      await onSaved();
    } catch (taskError) {
      if (taskId && !writesComplete) {
        await supabase.from("reminders").delete().eq("task_id", taskId).eq("user_id", userId);
        await supabase.from("tasks").delete().eq("id", taskId).eq("user_id", userId);
      }
      setError(taskError instanceof Error ? taskError.message : "Task could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Task" htmlFor="task-title">
        <Input
          id="task-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Book appointment, prepare meals, review saved links..."
          required
        />
      </Field>
      <Field label="Notes" htmlFor="task-notes">
        <Textarea id="task-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due" htmlFor="task-due">
          <Input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </Field>
        <Field label="Reminder" htmlFor="task-reminder">
          <Input id="task-reminder" type="datetime-local" value={reminderAt} min={todayInputValue()} onChange={(event) => setReminderAt(event.target.value)} />
        </Field>
      </div>
      <Field label="Priority" htmlFor="task-priority">
        <Select id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeat" htmlFor="task-recurrence">
          <Select id="task-recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as RecurrenceRule | "")}>
            <option value="">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Tags" htmlFor="task-tags">
          <Input id="task-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="workout, admin" />
        </Field>
      </div>
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Add task
      </Button>
    </form>
  );
}

function TaskList({
  tasks,
  tags,
  taggings,
  onChanged
}: {
  tasks: Task[];
  tags: Tag[];
  taggings: Tagging[];
  onChanged: () => Promise<void> | void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!tasks.length) return <EmptyState>No tasks yet. Add one thing that would make today easier.</EmptyState>;

  async function setStatus(task: Task, status: "open" | "done") {
    const supabase = getSupabase();
    setSavingId(task.id);
    setError(null);
    try {
      if (status === "done") {
        await completeTaskWithReminders(supabase, task, { tags, taggings });
      } else {
        const { error: updateError } = await supabase.from("tasks").update({ status }).eq("id", task.id).eq("user_id", task.user_id);
        if (updateError) throw new Error(updateError.message);
      }

      await onChanged();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : `${task.title} could not be updated.`);
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
      {tasks.map((task) => (
        <div className="rounded-tile border border-hairline bg-surface p-3" key={task.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-[14px] font-semibold ${task.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{task.title}</p>
              <p className="text-[12.5px] text-ink-muted">
                {task.due_at ? `Due ${formatShortDate(task.due_at)} ${formatTime(task.due_at)}` : "No due date"}
                {task.reminder_at ? ` · Reminder ${formatShortDate(task.reminder_at)} ${formatTime(task.reminder_at)}` : ""}
                {task.recurrence ? ` · Repeats ${task.recurrence}` : ""}
              </p>
              <TagBadges tags={tagsForTarget(tags, taggings, "task", task.id)} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={task.priority === "high" ? "urgent" : "neutral"}>{task.priority}</Badge>
              {task.status === "done" ? (
                <Button variant="secondary" size="sm" type="button" onClick={() => setStatus(task, "open")} disabled={savingId === task.id} aria-label="Reopen task">
                  {savingId === task.id ? <Loader2 size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
                </Button>
              ) : (
                <Button variant="primary" size="sm" type="button" onClick={() => setStatus(task, "done")} disabled={savingId === task.id} aria-label="Complete task">
                  {savingId === task.id ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TagBadges({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag.id}>#{tag.name}</Badge>
      ))}
    </div>
  );
}

function ReminderComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState(todayInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: reminderError } = await getSupabase().from("reminders").insert({
        user_id: userId,
        task_id: null,
        title,
        body: body.trim() || null,
        remind_at: dateInputToIso(remindAt) ?? new Date().toISOString(),
        status: "scheduled"
      });
      if (reminderError) throw new Error(reminderError.message);
      setTitle("");
      setBody("");
      setRemindAt(todayInputValue());
      await onSaved();
    } catch (reminderError) {
      setError(reminderError instanceof Error ? reminderError.message : "Reminder could not be scheduled.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Reminder" htmlFor="reminder-title">
        <Input id="reminder-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
      </Field>
      <Field label="Details" htmlFor="reminder-body">
        <Textarea id="reminder-body" value={body} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <Field label="When" htmlFor="reminder-at">
        <Input id="reminder-at" type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} required />
      </Field>
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
        Schedule
      </Button>
    </form>
  );
}

function ReminderList({ reminders, tasks, onChanged }: { reminders: Reminder[]; tasks: Task[]; onChanged: () => Promise<void> | void }) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scheduled = scheduledReminders(reminders, tasks);
  if (!scheduled.length) return <EmptyState>No scheduled reminders.</EmptyState>;

  async function cancel(reminder: Reminder) {
    const supabase = getSupabase();
    setSavingId(reminder.id);
    setError(null);
    try {
      const { error: reminderError } = await supabase.from("reminders").update({ status: "cancelled" }).eq("id", reminder.id).eq("user_id", reminder.user_id);
      if (reminderError) throw new Error(reminderError.message);
      if (reminder.task_id) {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ reminder_at: null, reminder_sent_at: null })
          .eq("id", reminder.task_id)
          .eq("user_id", reminder.user_id);
        if (taskError) {
          await supabase.from("reminders").update({ status: "scheduled" }).eq("id", reminder.id).eq("user_id", reminder.user_id);
          throw new Error(taskError.message);
        }
      }
      await onChanged();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Reminder could not be cancelled.");
    } finally {
      setSavingId(null);
    }
  }

  async function snooze(reminder: Reminder, preset: SnoozePreset) {
    const supabase = getSupabase();
    const nextReminderAt = postponeReminderAt(preset, reminder.remind_at);

    setSavingId(reminder.id);
    setError(null);

    try {
      const { error: reminderError } = await supabase
        .from("reminders")
        .update({ remind_at: nextReminderAt, status: "scheduled", sent_at: null })
        .eq("id", reminder.id)
        .eq("user_id", reminder.user_id);
      if (reminderError) throw new Error(reminderError.message);

      if (reminder.task_id) {
        const { error: taskError } = await supabase
          .from("tasks")
          .update({ reminder_at: nextReminderAt, reminder_sent_at: null })
          .eq("id", reminder.task_id)
          .eq("user_id", reminder.user_id);

        if (taskError) {
          await supabase
            .from("reminders")
            .update({ remind_at: reminder.remind_at, status: reminder.status, sent_at: reminder.sent_at })
            .eq("id", reminder.id)
            .eq("user_id", reminder.user_id);
          throw new Error(taskError.message);
        }
      }

      await onChanged();
    } catch (snoozeError) {
      setError(snoozeError instanceof Error ? snoozeError.message : "Reminder could not be snoozed.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      {scheduled.map((reminder) => (
        <div className="rounded-tile border border-hairline bg-surface p-3" key={reminder.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{reminder.title}</p>
              <p className="text-[12.5px] text-ink-muted">
                {formatShortDate(reminder.remind_at)} at {formatTime(reminder.remind_at)}
              </p>
            </div>
            {new Date(reminder.remind_at).getTime() <= Date.now() ? <Badge tone="urgent">due</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {SNOOZE_PRESETS.map((preset) => (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => void snooze(reminder, preset)}
                disabled={savingId === reminder.id}
                aria-label={`Snooze ${reminder.title} ${snoozePresetLabel(preset)}`}
                title={`Snooze ${snoozePresetLabel(preset)}`}
              >
                {savingId === reminder.id ? <Loader2 size={14} aria-hidden="true" /> : null}
                {snoozePresetLabel(preset)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" type="button" onClick={() => cancel(reminder)} disabled={savingId === reminder.id}>
              {savingId === reminder.id ? <Loader2 size={16} aria-hidden="true" /> : null}
              Cancel
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
