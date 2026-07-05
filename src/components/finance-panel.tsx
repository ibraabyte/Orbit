"use client";

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { Check, CreditCard, Loader2, PauseCircle, PlayCircle, Plus, ReceiptText, WalletCards } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckItem } from "@/components/ui/check-item";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list-row";
import { Segmented } from "@/components/ui/segmented";
import { StatTile } from "@/components/ui/stat-tile";
import { dateInputToIso, formatShortDate, formatTime, todayInputValue } from "@/lib/dates";
import { financeCategories, financeSummary, formatMoney, nextBillDueDate, normalizeCurrency, spendingByCategory } from "@/lib/finance";
import { getSupabase } from "@/lib/supabase";
import { createTaggings, ensureTags, parseTagInput, tagsForTarget } from "@/lib/tag-actions";
import type { Bill, BillRecurrence, Expense, FinanceCategory, Tag, Tagging } from "@/lib/types";

type FinanceMode = "expense" | "bill";

const FINANCE_MODES: { value: FinanceMode; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "bill", label: "Bill" }
];

export function FinancePanel({
  userId,
  expenses,
  bills,
  tags = [],
  taggings = [],
  onChanged,
  compact = false
}: {
  userId: string;
  expenses: Expense[];
  bills: Bill[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const summary = useMemo(() => financeSummary({ expenses, bills }), [bills, expenses]);

  return (
    <div className="flex flex-col gap-4">
      <ModuleCard title="Log money" kicker="Track spending, bills, and subscriptions manually.">
        <FinanceComposer userId={userId} onSaved={onChanged} />
      </ModuleCard>
      <ModuleCard title="Money view" kicker={`${formatMoney(summary.monthSpend)} this month, ${summary.upcomingBills.length} due soon`}>
        <FinanceRecent userId={userId} expenses={expenses} bills={bills} tags={tags} taggings={taggings} onChanged={onChanged} />
      </ModuleCard>
    </div>
  );
}

function FinanceComposer({ userId, onSaved }: { userId: string; onSaved: () => Promise<void> | void }) {
  const [mode, setMode] = useState<FinanceMode>("expense");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState<FinanceCategory>("other");
  const [loggedAt, setLoggedAt] = useState(todayInputValue());
  const [dueAt, setDueAt] = useState(todayInputValue().slice(0, 10));
  const [recurrence, setRecurrence] = useState<BillRecurrence>("monthly");
  const [autopay, setAutopay] = useState(false);
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = getSupabase();
      const parsedTags = parseTagInput(tagInput);
      const normalizedCurrency = normalizeCurrency(currency);
      const parsedAmount = Number(amount || 0);

      if (mode === "expense") {
        const { data, error: insertError } = await supabase
          .from("expenses")
          .insert({
            user_id: userId,
            merchant: name,
            amount: parsedAmount,
            currency: normalizedCurrency,
            category,
            note: note.trim() || null,
            spent_at: dateInputToIso(loggedAt) ?? new Date().toISOString()
          })
          .select()
          .single();
        if (insertError) throw new Error(insertError.message);
        if (data) await tagTarget(userId, "expense", data.id, parsedTags);
      }

      if (mode === "bill") {
        const { data, error: insertError } = await supabase
          .from("bills")
          .insert({
            user_id: userId,
            name,
            amount: parsedAmount,
            currency: normalizedCurrency,
            category,
            due_at: dueAt,
            recurrence,
            status: "active",
            autopay,
            note: note.trim() || null
          })
          .select()
          .single();
        if (insertError) throw new Error(insertError.message);
        if (data) await tagTarget(userId, "bill", data.id, parsedTags);
      }

      setName("");
      setAmount("");
      setNote("");
      setTagInput("");
      await onSaved();
    } catch (financeError) {
      setError(financeError instanceof Error ? financeError.message : "Finance save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <Segmented ariaLabel="Finance log type" size="sm" options={FINANCE_MODES} value={mode} onChange={setMode} />

      <Field label={mode === "expense" ? "Merchant" : "Bill or subscription"} htmlFor="finance-name">
        <Input
          id="finance-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={mode === "expense" ? "Coffee, groceries, gym..." : "Rent, Netflix, phone..."}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField id="finance-amount" label="Amount" value={amount} onChange={setAmount} required />
        <Field label="Currency" htmlFor="finance-currency">
          <Input id="finance-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} required />
        </Field>
      </div>

      <Field label="Category" htmlFor="finance-category">
        <Select id="finance-category" value={category} onChange={(event) => setCategory(event.target.value as FinanceCategory)}>
          {financeCategories.map((item) => (
            <option value={item} key={item}>
              {labelize(item)}
            </option>
          ))}
        </Select>
      </Field>

      {mode === "expense" ? (
        <Field label="Spent at" htmlFor="finance-logged-at">
          <Input id="finance-logged-at" type="datetime-local" value={loggedAt} onChange={(event) => setLoggedAt(event.target.value)} />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next due" htmlFor="finance-due-at">
              <Input id="finance-due-at" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
            </Field>
            <Field label="Repeats" htmlFor="finance-recurrence">
              <Select id="finance-recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value as BillRecurrence)}>
                <option value="once">Once</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            </Field>
          </div>
          <CheckItem checked={autopay} onChange={setAutopay} label="Autopay" id="finance-autopay" />
        </>
      )}

      <Field label="Tags" htmlFor="finance-tags">
        <Input id="finance-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="home, tax, business" />
      </Field>

      <Field label="Note" htmlFor="finance-note">
        <Textarea id="finance-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : mode === "bill" ? <CreditCard size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
        Save {mode}
      </Button>
    </form>
  );
}

function FinanceRecent({
  userId,
  expenses,
  bills,
  tags,
  taggings,
  onChanged
}: {
  userId: string;
  expenses: Expense[];
  bills: Bill[];
  tags: Tag[];
  taggings: Tagging[];
  onChanged: () => Promise<void> | void;
}) {
  const [savingBillId, setSavingBillId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => financeSummary({ expenses, bills }), [bills, expenses]);
  const categories = useMemo(() => spendingByCategory(expenses).slice(0, 4), [expenses]);
  const billsDue = useMemo(() => [...summary.overdueBills, ...summary.upcomingBills].slice(0, 5), [summary.overdueBills, summary.upcomingBills]);
  const recentExpenses = expenses.slice(0, 6);

  async function markPaid(bill: Bill) {
    setSavingBillId(bill.id);
    setError(null);
    try {
      const nextDue = nextBillDueDate(bill);
      const update = nextDue ? { due_at: nextDue, status: "active" as const } : { status: "paid" as const };
      const { error: updateError } = await getSupabase().from("bills").update(update).eq("id", bill.id).eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      await onChanged();
    } catch (billError) {
      setError(billError instanceof Error ? billError.message : `${bill.name} could not be marked paid.`);
    } finally {
      setSavingBillId(null);
    }
  }

  async function togglePaused(bill: Bill) {
    setSavingBillId(bill.id);
    setError(null);
    try {
      const { error: updateError } = await getSupabase()
        .from("bills")
        .update({ status: bill.status === "paused" ? "active" : "paused" })
        .eq("id", bill.id)
        .eq("user_id", userId);
      if (updateError) throw new Error(updateError.message);
      await onChanged();
    } catch (billError) {
      setError(billError instanceof Error ? billError.message : `${bill.name} could not be updated.`);
    } finally {
      setSavingBillId(null);
    }
  }

  if (!expenses.length && !bills.length) {
    return <EmptyState>No finance records yet. Add one recent expense or one bill to start the money view.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <FinanceStat icon={<ReceiptText size={16} />} label="This month" value={formatMoney(summary.monthSpend)} />
        <FinanceStat icon={<WalletCards size={16} />} label="Today" value={formatMoney(summary.todaySpend)} />
        <FinanceStat icon={<CreditCard size={16} />} label="Monthly bills" value={formatMoney(summary.monthlyCommitments)} />
        <FinanceStat icon={<CreditCard size={16} />} label="Due soon" value={summary.upcomingBills.length + summary.overdueBills.length} />
      </div>

      {error ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {error}
        </div>
      ) : null}

      {categories.length ? (
        <div className="flex flex-col gap-1.5">
          {categories.map((item) => (
            <ListRow
              key={item.category}
              title={labelize(item.category)}
              subtitle={`${item.count} transaction${item.count === 1 ? "" : "s"}`}
              trailing={<Badge>{formatMoney(item.total)}</Badge>}
            />
          ))}
        </div>
      ) : null}

      {billsDue.length ? (
        <div className="flex flex-col gap-1.5">
          {billsDue.map((bill) => {
            const billTags = tagsForTarget(tags, taggings, "bill", bill.id);
            return (
              <div className="rounded-tile border border-hairline bg-surface p-3" key={bill.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{bill.name}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {formatMoney(Number(bill.amount), bill.currency)} · due {formatShortDate(`${bill.due_at}T12:00:00`)} · {bill.recurrence}
                      {bill.autopay ? " · autopay" : ""}
                    </p>
                    {billTags.length ? <TagRow tags={billTags} /> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {bill.status === "paused" ? <Badge tone="warning">paused</Badge> : null}
                    <Button variant="primary" size="sm" type="button" onClick={() => markPaid(bill)} disabled={savingBillId === bill.id} aria-label={`Mark ${bill.name} paid`}>
                      {savingBillId === bill.id ? <Loader2 size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => togglePaused(bill)}
                      disabled={savingBillId === bill.id}
                      aria-label={bill.status === "paused" ? `Resume ${bill.name}` : `Pause ${bill.name}`}
                    >
                      {savingBillId === bill.id ? (
                        <Loader2 size={16} aria-hidden="true" />
                      ) : bill.status === "paused" ? (
                        <PlayCircle size={16} aria-hidden="true" />
                      ) : (
                        <PauseCircle size={16} aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {recentExpenses.length ? (
        <div className="flex flex-col gap-1.5">
          {recentExpenses.map((expense) => {
            const expenseTags = tagsForTarget(tags, taggings, "expense", expense.id);
            return (
              <div className="rounded-tile border border-hairline bg-surface p-3" key={expense.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{expense.merchant}</p>
                    <p className="text-[12.5px] text-ink-muted">
                      {formatShortDate(expense.spent_at)} {formatTime(expense.spent_at)} · {labelize(expense.category)}
                    </p>
                    {expenseTags.length ? <TagRow tags={expenseTags} /> : null}
                  </div>
                  <Badge>{formatMoney(Number(expense.amount), expense.currency)}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FinanceStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <StatTile icon={icon} label={label} value={value} />;
}

function NumberField({ id, label, value, required, onChange }: { id: string; label: string; value: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </Field>
  );
}

function TagRow({ tags }: { tags: Tag[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag.id}>#{tag.name}</Badge>
      ))}
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

async function tagTarget(userId: string, targetType: "expense" | "bill", targetId: string, names: string[]) {
  const tags = await ensureTags(userId, names);
  await createTaggings(userId, targetType, targetId, tags);
}
