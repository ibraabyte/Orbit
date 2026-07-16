"use client";

import { FormEvent, useMemo, useState } from "react";
import { Command, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LoadingBlock } from "@/components/loading-block";
import { ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { formatMacros } from "@/lib/food";
import { parseQuickAdd, validateQuickAddDraft, type QuickAddDraft } from "@/lib/quick-add";
import { executeQuickAdd } from "@/lib/quick-add-executor";

const examples = [
  "task: Book dentist !high @tomorrow 9am ~in 2 hours repeat monthly #admin",
  "reminder: Take vitamins ~tomorrow at 8am",
  "capture: https://example.com Read later #research",
  "meal: Chicken bowl 650cal 45p 62c 18f #protein",
  "mealplan: Salmon dinner 720cal protein 48g carbs 55g fat 24g dinner @friday #prep",
  "grocery: 2 tubs Greek yogurt dairy @friday #prep",
  "person: Sara relationship friend via WhatsApp birthday 1996-07-12 favorite @next week",
  "workout: Push day 45min #gym",
  "weight: 82kg",
  "sleep: 7.5h quality 4 #recovery",
  "focus: Deep work 50min energy 4 #work",
  "expense: Coffee 4.50 USD #food",
  "bill: Internet 65 USD monthly autopay @2026-07-10 #home",
  "habit: Walk daily",
  "goal: Cut to 80kg @2026-09-01",
  "journal: good Strong focus today"
];

export function CommandPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const { data, refresh } = useDashboardData();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = useMemo(() => parseQuickAdd(input, { defaultWeightUnit: data.profile?.weight_unit ?? "kg" }), [data.profile?.weight_unit, input]);
  const validation = useMemo(() => validateQuickAddDraft(draft, input), [draft, input]);

  if (!userId) return <LoadingBlock />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    const currentUserId = userId;
    if (!validation.ok) {
      setMessage(null);
      setError(null);
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      await executeQuickAdd(currentUserId, draft);
      setInput("");
      setMessage(`Added ${draft.kind}.`);
      await refresh();
    } catch (quickAddError) {
      setError(quickAddError instanceof Error ? quickAddError.message : "Quick add failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Command" subtitle="Add common Orbit records from one line." />
      <div className="flex flex-col gap-4">
        <ModuleCard title="Quick add" kicker="Use a prefix, optional #tags, !priority, @due, and ~reminder.">
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Field label="Command" htmlFor="quick-add">
              <Input
                id="quick-add"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError(null);
                  setMessage(null);
                }}
                placeholder="task: Prepare meals !high #health"
                autoFocus
                required
              />
            </Field>
            <Preview draft={draft} />
            {!validation.ok ? <div className="text-[13px] font-semibold text-urgent" role="alert">{validation.message}</div> : null}
            {error ? <div className="text-[13px] font-semibold text-urgent" role="alert">{error}</div> : null}
            {message ? <div className="text-[13px] font-semibold text-emerald-4" role="status">{message}</div> : null}
            <Button variant="primary" type="submit" disabled={saving || !input.trim() || !validation.ok} className="self-start">
              {saving ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              Add to Orbit
            </Button>
          </form>
        </ModuleCard>

        <ModuleCard title="Examples" kicker="Copy the shape, not the exact text.">
          <div className="flex flex-col gap-1.5">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="flex items-center justify-between gap-2 rounded-tile border border-hairline bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep"
              >
                <span className="min-w-0 truncate text-[12.5px] text-ink">{example}</span>
                <Command size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
              </button>
            ))}
          </div>
        </ModuleCard>
      </div>
    </div>
  );
}

function Preview({ draft }: { draft: QuickAddDraft }) {
  const macros = formatMacros({ protein: draft.proteinG, carbs: draft.carbsG, fat: draft.fatG });
  const groceryMeta =
    draft.kind === "grocery" ? [draft.groceryQuantity, draft.groceryCategory !== "other" ? draft.groceryCategory : null].filter(Boolean).join(" · ") : "";
  const personMeta =
    draft.kind === "person"
      ? [draft.personRelationship ? `relationship ${draft.personRelationship}` : null, draft.contactMethod ? `contact ${draft.contactMethod}` : null, draft.birthday ? `birthday ${draft.birthday}` : null]
          .filter(Boolean)
          .join(" · ")
      : "";
  const billMeta = draft.kind === "bill" && draft.billAutopay ? "autopay" : "";

  return (
    <div className="rounded-tile border border-hairline bg-surface-inset px-3 py-2 text-[13px] text-ink-muted">
      <strong className="font-semibold text-ink">{draft.kind}</strong>: {draft.title}
      {draft.at ? ` · due ${new Date(draft.at).toLocaleString()}` : ""}
      {draft.reminderAt ? ` · remind ${new Date(draft.reminderAt).toLocaleString()}` : ""}
      {draft.recurrence ? ` · repeats ${draft.recurrence}` : ""}
      {macros ? ` · ${macros}` : ""}
      {groceryMeta ? ` · ${groceryMeta}` : ""}
      {personMeta ? ` · ${personMeta}` : ""}
      {billMeta ? ` · ${billMeta}` : ""}
      {draft.tags.length ? ` · #${draft.tags.join(" #")}` : ""}
    </div>
  );
}
