"use client";

import { Bed, Bell, Bookmark, Check, ClipboardCheck, Clock3, CreditCard, ExternalLink, Flag, Inbox, Loader2, NotebookPen, Repeat2, SquareCheckBig, Timer, Users, Utensils, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { LoadingBlock } from "@/components/loading-block";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/components/auth-provider";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { createReminderFromCapture, createTaskFromCapture } from "@/lib/capture-actions";
import { nextBillDueDate } from "@/lib/finance";
import { attachmentsForCapture } from "@/lib/library";
import { markPersonContacted } from "@/lib/people-actions";
import { snoozeReminderAt } from "@/lib/reminders";
import { getSupabase } from "@/lib/supabase";
import { completeTaskWithReminders } from "@/lib/task-completion";
import { buildTriageSummary, triageActionsForItem, type TriageAction, type TriageItem, type TriageKind, type TriageTone } from "@/lib/triage";
import type { DashboardData } from "@/lib/types";

const kindLabels: Record<TriageKind, string> = {
  task: "Tasks",
  reminder: "Reminders",
  capture: "Captures",
  focus: "Focus",
  food: "Food",
  people: "People",
  health: "Health",
  finance: "Finance",
  habit: "Habits",
  goal: "Goals",
  journal: "Journal"
};

const kindIcons: Record<TriageKind, ReactNode> = {
  task: <SquareCheckBig size={16} aria-hidden="true" />,
  reminder: <Timer size={16} aria-hidden="true" />,
  capture: <Bookmark size={16} aria-hidden="true" />,
  focus: <Timer size={16} aria-hidden="true" />,
  food: <Utensils size={16} aria-hidden="true" />,
  people: <Users size={16} aria-hidden="true" />,
  health: <Bed size={16} aria-hidden="true" />,
  finance: <CreditCard size={16} aria-hidden="true" />,
  habit: <Repeat2 size={16} aria-hidden="true" />,
  goal: <Flag size={16} aria-hidden="true" />,
  journal: <NotebookPen size={16} aria-hidden="true" />
};

export function InboxPage() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useDashboardData(user?.id);
  const [savingActionKey, setSavingActionKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const triage = useMemo(() => buildTriageSummary(data), [data]);
  const grouped = useMemo(() => groupItems(triage.items), [triage.items]);

  if (!user) return null;
  const userId = user.id;

  async function runTriageAction(item: TriageItem, action: TriageAction) {
    const key = actionKey(item, action);
    setSavingActionKey(key);
    setActionError(null);
    try {
      await executeTriageAction(userId, action, data);
      await refresh();
    } catch (inboxError) {
      setActionError(inboxError instanceof Error ? inboxError.message : "Inbox action could not be completed.");
    } finally {
      setSavingActionKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Inbox" subtitle="Triage loose, stale, or unprocessed Orbit records.">
        <ButtonLink href="/command" size="sm">
          <Inbox size={15} aria-hidden="true" />
          Quick add
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
          {actionError ? (
            <div className="rounded-tile border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-urgent" role="alert">
              {actionError}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(kindLabels) as TriageKind[]).map((kind) => (
              <StatTile key={kind} icon={kindIcons[kind]} label={kindLabels[kind]} value={triage.counts[kind]} tone={triage.counts[kind] ? "accent" : "neutral"} />
            ))}
          </div>

          {triage.total ? (
            <div className="flex flex-col gap-4">
              {(Object.keys(grouped) as TriageKind[])
                .filter((kind) => grouped[kind].length)
                .map((kind) => (
                  <ModuleCard key={kind} title={kindLabels[kind]} kicker={`${grouped[kind].length} item${grouped[kind].length === 1 ? "" : "s"} to process`}>
                    <div className="flex flex-col gap-2">
                      {grouped[kind].map((item) => (
                        <TriageRow item={item} key={item.id} savingActionKey={savingActionKey} onAction={runTriageAction} />
                      ))}
                    </div>
                  </ModuleCard>
                ))}
            </div>
          ) : (
            <ModuleCard title="Inbox clear" kicker="No loose or stale records found.">
              <EmptyState>Everything loaded has enough structure for Today, Plan, Calendar, Search, and Insights.</EmptyState>
            </ModuleCard>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TriageRow({
  item,
  savingActionKey,
  onAction
}: {
  item: TriageItem;
  savingActionKey: string | null;
  onAction: (item: TriageItem, action: TriageAction) => Promise<void> | void;
}) {
  const actions = triageActionsForItem(item);

  return (
    <div className="rounded-tile border border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{item.title}</p>
          <p className="text-[12.5px] text-ink-muted">{item.detail}</p>
        </div>
        <Badge tone={triageTone(item.tone)}>{item.tone === "neutral" ? "triage" : item.tone}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {actions.map((action) => {
          const key = actionKey(item, action);
          return (
            <Button
              key={action.type}
              variant="ghost"
              size="sm"
              disabled={Boolean(savingActionKey)}
              onClick={() => void onAction(item, action)}
              aria-label={`${action.label} ${item.title}`}
            >
              {savingActionKey === key ? <Loader2 size={14} aria-hidden="true" /> : actionIcon(action)}
              {action.label}
            </Button>
          );
        })}
        <ButtonLink href={item.href} variant="ghost" size="sm">
          <ExternalLink size={14} aria-hidden="true" />
          Open
        </ButtonLink>
      </div>
    </div>
  );
}

function groupItems(items: TriageItem[]) {
  return items.reduce<Record<TriageKind, TriageItem[]>>(
    (groups, item) => {
      groups[item.kind].push(item);
      return groups;
    },
    { task: [], reminder: [], capture: [], focus: [], food: [], people: [], health: [], finance: [], habit: [], goal: [], journal: [] }
  );
}

function triageTone(tone: TriageTone): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  return "neutral";
}

function actionKey(item: TriageItem, action: TriageAction) {
  return `${item.id}:${action.type}`;
}

function actionIcon(action: TriageAction) {
  if (action.type === "task-capture") return <ClipboardCheck size={14} aria-hidden="true" />;
  if (action.type === "remind-capture") return <Bell size={14} aria-hidden="true" />;
  if (action.type === "snooze-reminder" || action.type === "snooze-task-reminder") return <Clock3 size={14} aria-hidden="true" />;
  if (action.type === "cancel-focus" || action.type === "skip-meal-plan") return <X size={14} aria-hidden="true" />;
  return <Check size={14} aria-hidden="true" />;
}

async function executeTriageAction(userId: string, action: TriageAction, data: DashboardData) {
  const supabase = getSupabase();
  const now = new Date();
  const nowIso = now.toISOString();

  if (action.type === "complete-task") {
    const task = data.tasks.find((candidate) => candidate.id === action.targetId);
    if (!task) throw new Error("Task is no longer available.");
    await completeTaskWithReminders(supabase, task, { completedAt: now, tags: data.tags, taggings: data.taggings });
    return;
  }

  if (action.type === "task-capture") {
    const capture = data.captures.find((candidate) => candidate.id === action.targetId);
    if (!capture) throw new Error("Capture is no longer available.");
    await createTaskFromCapture(userId, capture, attachmentsForCapture(data.attachments, capture.id), supabase);
    return;
  }

  if (action.type === "remind-capture") {
    const capture = data.captures.find((candidate) => candidate.id === action.targetId);
    if (!capture) throw new Error("Capture is no longer available.");
    await createReminderFromCapture(userId, capture, attachmentsForCapture(data.attachments, capture.id), undefined, supabase);
    return;
  }

  if (action.type === "ack-reminder") {
    const reminder = data.reminders.find((candidate) => candidate.id === action.targetId);
    await assertNoError(
      await supabase.from("reminders").update({ status: "sent", sent_at: nowIso }).eq("id", action.targetId).eq("user_id", userId)
    );
    if (reminder?.task_id) {
      await assertNoError(await supabase.from("tasks").update({ reminder_sent_at: nowIso }).eq("id", reminder.task_id).eq("user_id", userId));
    }
    return;
  }

  if (action.type === "snooze-reminder") {
    const nextReminderAt = snoozeReminderAt("1h", now);
    const reminder = data.reminders.find((candidate) => candidate.id === action.targetId);
    await assertNoError(
      await supabase
        .from("reminders")
        .update({ remind_at: nextReminderAt, sent_at: null, status: "scheduled" })
        .eq("id", action.targetId)
        .eq("user_id", userId)
    );
    if (reminder?.task_id) {
      await assertNoError(
        await supabase.from("tasks").update({ reminder_at: nextReminderAt, reminder_sent_at: null }).eq("id", reminder.task_id).eq("user_id", userId)
      );
    }
    return;
  }

  if (action.type === "ack-task-reminder") {
    await assertNoError(await supabase.from("tasks").update({ reminder_sent_at: nowIso }).eq("id", action.targetId).eq("user_id", userId));
    return;
  }

  if (action.type === "snooze-task-reminder") {
    await assertNoError(
      await supabase.from("tasks").update({ reminder_at: snoozeReminderAt("1h", now), reminder_sent_at: null }).eq("id", action.targetId).eq("user_id", userId)
    );
    return;
  }

  if (action.type === "cancel-focus") {
    await assertNoError(await supabase.from("focus_sessions").update({ status: "cancelled" }).eq("id", action.targetId).eq("user_id", userId));
    return;
  }

  if (action.type === "skip-meal-plan") {
    await assertNoError(await supabase.from("meal_plans").update({ status: "skipped" }).eq("id", action.targetId).eq("user_id", userId));
    return;
  }

  if (action.type === "buy-grocery") {
    await assertNoError(await supabase.from("grocery_items").update({ status: "bought" }).eq("id", action.targetId).eq("user_id", userId));
    return;
  }

  if (action.type === "contact-person") {
    await markPersonContacted(userId, action.targetId, 30, now, supabase);
    return;
  }

  if (action.type === "pay-bill") {
    const bill = data.bills.find((candidate) => candidate.id === action.targetId);
    if (!bill) throw new Error("Bill is no longer available.");
    const nextDue = nextBillDueDate(bill, now);
    const update = nextDue ? { due_at: nextDue, status: "active" as const } : { status: "paid" as const };
    await assertNoError(await supabase.from("bills").update(update).eq("id", action.targetId).eq("user_id", userId));
    return;
  }

  await assertNoError(
    await supabase.from("habit_logs").insert({
      user_id: userId,
      habit_id: action.targetId,
      logged_at: nowIso,
      note: null
    })
  );
}

async function assertNoError(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
