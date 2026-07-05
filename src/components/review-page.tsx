"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Loader2, Save } from "lucide-react";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list-row";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatShortDate } from "@/lib/dates";
import { todayEntry } from "@/lib/journal";
import { buildReviewSummary, type ReviewHandoff, type ReviewMetric, type ReviewMode, type ReviewTone } from "@/lib/review";
import { getSupabase } from "@/lib/supabase";
import type { JournalEntry, JournalMood } from "@/lib/types";

const reviewModes: Array<{ value: ReviewMode; label: string }> = [
  { value: "morning", label: "Morning" },
  { value: "evening", label: "Evening" },
  { value: "weekly", label: "Weekly" }
];

const moodOptions: Array<{ value: JournalMood; label: string }> = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "neutral", label: "Neutral" },
  { value: "low", label: "Low" },
  { value: "bad", label: "Bad" }
];

export function ReviewPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  const [mode, setMode] = useState<ReviewMode>("evening");
  const review = useMemo(() => buildReviewSummary(data, mode), [data, mode]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Review" subtitle={`Close the loop for ${formatShortDate(review.date)} with the data already in Orbit.`}>
        <Segmented ariaLabel="Review mode" size="sm" options={reviewModes} value={mode} onChange={setMode} />
        <ButtonLink href="/plan" size="sm">
          <ClipboardCheck size={15} aria-hidden="true" />
          Plan
        </ButtonLink>
      </PageHeader>

      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      {!loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {review.metrics.map((metric) => (
              <ReviewMetricTile key={metric.label} metric={metric} />
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <ModuleCard title="Review actions" kicker={`${review.score}% readiness · ${review.scoreLabel}`}>
              <div className="flex flex-col gap-1.5">
                {review.actions.map((action) => (
                  <ListRow
                    key={action.id}
                    href={action.href}
                    title={action.title}
                    subtitle={action.detail}
                    trailing={<Badge tone={reviewTone(action.tone)}>{action.tone === "neutral" ? "review" : action.tone}</Badge>}
                  />
                ))}
              </div>
            </ModuleCard>

            <ModuleCard title="Reflection prompts" kicker={`${modeLabel(mode)} questions for a useful note.`}>
              <div className="flex flex-col gap-1.5">
                {review.prompts.map((prompt) => (
                  <ListRow key={prompt} title={prompt} trailing={<Badge>prompt</Badge>} />
                ))}
              </div>
            </ModuleCard>

            <ModuleCard title="Save reflection" kicker="Writes to today’s journal entry.">
              <ReviewJournalForm userId={user.id} date={review.date} entries={data.journalEntries} draft={review.journalDraft} onSaved={refresh} />
            </ModuleCard>

            <ModuleCard title="Tomorrow handoff" kicker={`${review.handoff.eventCount} item${review.handoff.eventCount === 1 ? "" : "s"} on ${review.handoff.label}`}>
              <ReviewHandoffPanel handoff={review.handoff} />
            </ModuleCard>

            <ModuleCard title="Highlights" kicker="Signals that went well.">
              <ReviewList items={review.highlights} empty="No highlights yet. Log a focus session, habit, meal, or journal note to create one." badge="win" tone="success" />
            </ModuleCard>

            <ModuleCard title="Gaps" kicker="Items worth closing or explaining.">
              <ReviewList items={review.gaps} empty="No obvious gaps from today’s data." badge="gap" tone="warning" />
            </ModuleCard>

            <ModuleCard title="Next check" kicker="Use review with your calendar and journal.">
              <div className="flex flex-col gap-1.5">
                <ListRow
                  href="/calendar"
                  title="Scan upcoming dated items"
                  subtitle="Next tasks, reminders, focus blocks, bills, logs, and goals."
                  trailing={
                    <Badge>
                      <CalendarDays size={13} aria-hidden="true" />
                      calendar
                    </Badge>
                  }
                />
                <ListRow
                  href="/journal"
                  title="Read recent reflections"
                  subtitle="Recent mood and notes before the next plan."
                  trailing={
                    <Badge>
                      <BookOpen size={13} aria-hidden="true" />
                      journal
                    </Badge>
                  }
                />
              </div>
            </ModuleCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewMetricTile({ metric }: { metric: ReviewMetric }) {
  return <StatTile label={metric.label} value={metric.value} hint={metric.detail} tone={reviewStatTone(metric.tone)} />;
}

function ReviewList({ items, empty, badge, tone }: { items: string[]; empty: string; badge: string; tone?: "warning" | "success" }) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <ListRow key={item} title={item} trailing={<Badge tone={tone === "success" ? "success" : tone === "warning" ? "warning" : "neutral"}>{badge}</Badge>} />
      ))}
    </div>
  );
}

function ReviewHandoffPanel({ handoff }: { handoff: ReviewHandoff }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ListRow
        href={handoff.firstMove.href}
        title={handoff.firstMove.title}
        subtitle={handoff.firstMove.detail}
        trailing={
          <Badge tone={reviewTone(handoff.firstMove.tone)}>
            <ArrowRight size={13} aria-hidden="true" />
            first
          </Badge>
        }
      />
      {handoff.events.map((event) => (
        <ListRow key={event.id} href={event.href} title={event.title} subtitle={event.detail} trailing={<Badge>{event.kind}</Badge>} />
      ))}
      {handoff.hiddenCount ? (
        <EmptyState>
          {handoff.hiddenCount} more tomorrow item{handoff.hiddenCount === 1 ? "" : "s"} on the calendar.
        </EmptyState>
      ) : null}
    </div>
  );
}

function ReviewJournalForm({
  userId,
  date,
  entries,
  draft,
  onSaved
}: {
  userId: string;
  date: string;
  entries: JournalEntry[];
  draft: { mood: JournalMood; title: string; body: string };
  onSaved: () => Promise<void> | void;
}) {
  const existing = todayEntry(entries, new Date(`${date}T12:00:00`));
  const [mood, setMood] = useState<JournalMood>(draft.mood);
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMood(draft.mood);
    setTitle(draft.title);
    setBody(draft.body);
    setMessage(null);
    setError(null);
  }, [draft.body, draft.mood, draft.title]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: upsertError } = await getSupabase().from("journal_entries").upsert(
      {
        id: existing?.id,
        user_id: userId,
        mood,
        title: title.trim() || null,
        body,
        entry_date: date
      },
      { onConflict: "user_id,entry_date" }
    );

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMessage("Review saved to journal.");
    await onSaved();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Field label="Mood">
        <Segmented ariaLabel="Review mood" size="sm" options={moodOptions} value={mood} onChange={setMood} />
      </Field>
      <Field label="Title" htmlFor="review-title">
        <Input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Entry" htmlFor="review-body">
        <Textarea id="review-body" value={body} onChange={(event) => setBody(event.target.value)} required />
      </Field>
      {message ? (
        <div className="text-[13px] font-semibold text-emerald-4" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}
      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        Save review
      </Button>
    </form>
  );
}

function reviewTone(tone: ReviewTone): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}

function reviewStatTone(tone: ReviewMetric["tone"]) {
  if (tone === "danger" || tone === "warning") return "urgent" as const;
  if (tone === "success") return "success" as const;
  return "neutral" as const;
}

function modeLabel(mode: ReviewMode) {
  if (mode === "morning") return "Morning";
  if (mode === "weekly") return "Weekly";
  return "Evening";
}
