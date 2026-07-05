"use client";

import { FormEvent, useMemo, useState } from "react";
import { BookOpen, Loader2, Save } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { formatShortDate } from "@/lib/dates";
import { averageMood, journalEntriesInLastDays, todayEntry } from "@/lib/journal";
import { getSupabase } from "@/lib/supabase";
import type { JournalEntry, JournalMood } from "@/lib/types";

const moodOptions: Array<{ value: JournalMood; label: string }> = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "low", label: "Low" },
  { value: "bad", label: "Bad" }
];

export function JournalPanel({
  userId,
  entries,
  onChanged,
  compact = false
}: {
  userId: string;
  entries: JournalEntry[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const recent = useMemo(() => entries.slice(0, compact ? 4 : 12), [compact, entries]);
  const weeklyEntries = useMemo(() => journalEntriesInLastDays(entries, 7), [entries]);
  const mood = averageMood(weeklyEntries);
  const existing = todayEntry(entries);

  return (
    <div className="flex flex-col gap-4">
      {!compact ? (
        <ModuleCard title="Today’s journal" kicker={existing ? "Today has a saved reflection." : mood ? `7-day mood: ${mood}` : "A lightweight daily reflection."}>
          <JournalComposer userId={userId} entries={entries} onSaved={onChanged} />
        </ModuleCard>
      ) : null}
      <ModuleCard title={compact ? "Journal" : "Recent entries"} kicker={`${entries.length} entries loaded`}>
        <div className="flex flex-col gap-4">
          {!compact ? <JournalStats entries={entries} weeklyEntries={weeklyEntries} mood={mood} /> : null}
          <JournalList entries={recent} />
        </div>
      </ModuleCard>
    </div>
  );
}

function JournalComposer({
  userId,
  entries,
  onSaved
}: {
  userId: string;
  entries: JournalEntry[];
  onSaved: () => Promise<void> | void;
}) {
  const existing = todayEntry(entries);
  const [mood, setMood] = useState<JournalMood>(existing?.mood ?? "neutral");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryDate = new Date().toISOString().slice(0, 10);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const { error: upsertError } = await getSupabase().from("journal_entries").upsert(
      {
        id: existing?.id,
        user_id: userId,
        mood,
        title: title.trim() || null,
        body,
        entry_date: entryDate
      },
      { onConflict: "user_id,entry_date" }
    );

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    await onSaved();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Mood">
        <Segmented ariaLabel="Mood" size="sm" options={moodOptions} value={mood} onChange={setMood} />
      </Field>
      <Field label="Title" htmlFor="journal-title">
        <Input id="journal-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Entry" htmlFor="journal-body">
        <Textarea id="journal-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="What happened, what mattered, what should change tomorrow?" required />
      </Field>
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        Save today
      </Button>
    </form>
  );
}

function JournalStats({
  entries,
  weeklyEntries,
  mood
}: {
  entries: JournalEntry[];
  weeklyEntries: JournalEntry[];
  mood: JournalMood | null;
}) {
  const latest = entries[0];

  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Journal summary">
      <StatTile label="This week" value={weeklyEntries.length} hint="entries in the last 7 days" />
      <StatTile label="Mood trend" value={mood ?? "none"} hint="based on recent entries" tone={mood ? moodTone(mood) === "urgent" ? "urgent" : "accent" : "neutral"} />
      <StatTile label="Latest" value={latest ? formatShortDate(latest.entry_date) : "empty"} hint={latest?.title ?? "No reflection saved yet"} />
    </div>
  );
}

function JournalList({ entries }: { entries: JournalEntry[] }) {
  if (!entries.length) return <EmptyState>No journal entries yet. Add today’s entry to start a useful history.</EmptyState>;

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <div className="rounded-tile border border-hairline bg-surface p-3" key={entry.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">{entry.title || formatShortDate(entry.entry_date)}</p>
              <p className="text-[12.5px] text-ink-muted">
                {formatShortDate(entry.entry_date)} · Mood: {entry.mood}
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">{entry.body}</p>
            </div>
            <Badge tone={moodTone(entry.mood)}>
              <BookOpen size={13} aria-hidden="true" />
              {entry.mood}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function moodTone(mood: JournalMood): BadgeTone {
  if (mood === "great") return "success";
  if (mood === "good") return "accent";
  if (mood === "low") return "warning";
  if (mood === "bad") return "urgent";
  return "neutral";
}
