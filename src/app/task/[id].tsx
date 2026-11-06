import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Chip, Chips } from "@/components/chips";
import { Card, CheckItem, EmptyState, Icon, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useTaskActions } from "@/hooks/use-task-actions";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { dayAt, nextStepPosition, parseClock, recurrences, reminderAt, reminderLead, REMINDER_LEADS, repeatGlyph, snoozeChanges, sortLists, stepsByTask, type ReminderLead } from "@/lib/tasks";
import type { RecurrenceRule, Task, TaskPriority } from "@/lib/types";

type Draft = {
  title: string;
  notes: string;
  listId: string | null;
  day: string | null; // YYYY-MM-DD, local
  time: string; // "09:30"
  lead: ReminderLead;
  priority: TaskPriority;
  recurrence: RecurrenceRule | "never";
};

const pad = (value: number) => String(value).padStart(2, "0");
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function fromTask(task: Task): Draft {
  const due = task.due_at ? new Date(task.due_at) : null;
  return {
    title: task.title,
    notes: task.notes ?? "",
    listId: task.list_id,
    day: due ? dayKey(due) : null,
    time: due ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : "09:00",
    lead: reminderLead(task),
    priority: task.priority,
    recurrence: task.recurrence ?? "never"
  };
}

// Only what changed, so an untouched reminder is not rescheduled. null when the time can't be read.
function changesFrom(task: Task, draft: Draft): Record<string, unknown> | null {
  const clock = parseClock(draft.time);
  if (draft.day && !clock) return null;
  const dueAt = draft.day && clock ? dayAt(draft.day, clock).toISOString() : null;
  // A custom reminder keeps its lead when the due time moves.
  const remindAt = draft.lead === "custom" && dueAt && task.due_at ? (snoozeChanges(task, new Date(dueAt)).reminder_at ?? null) : reminderAt(dueAt, draft.lead, task.reminder_at);
  const next: Record<string, unknown> = {
    title: draft.title.replace(/\s+/g, " ").trim(),
    notes: draft.notes.trim() || null,
    list_id: draft.listId,
    due_at: dueAt,
    reminder_at: remindAt,
    priority: draft.priority,
    recurrence: draft.recurrence === "never" ? null : draft.recurrence
  };
  const current: Record<string, unknown> = { title: task.title, notes: task.notes, list_id: task.list_id, due_at: task.due_at, reminder_at: task.reminder_at, priority: task.priority, recurrence: task.recurrence };
  const same = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" && /^\d{4}-/.test(a) ? new Date(a).getTime() === new Date(b).getTime() : a === b);
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => !same(value, current[key])));
}

// One task: edit everything, tick its checklist, snooze, finish or delete it.
export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, refresh, act } = useDashboardData();
  const { pickDate, toast } = useOverlays();
  const actions = useTaskActions();
  const task = data.tasks.find((item) => item.id === id);
  const steps = useMemo(() => (task ? (stepsByTask(data.taskSteps).get(task.id) ?? []) : []), [data.taskSteps, task]);
  const lists = useMemo(() => sortLists(data.taskLists), [data.taskLists]);

  const initial = useMemo(() => (task ? fromTask(task) : null), [task]);
  const [draft, setDraft] = useState<Draft | null>(initial);
  // The draft as last loaded or saved; a fresh copy from the server replaces the draft only while it is untouched.
  const [clean, setClean] = useState(() => JSON.stringify(initial));
  const [newStep, setNewStep] = useState("");
  const [newList, setNewList] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    setDraft((current) => (current === null || JSON.stringify(current) === clean ? initial : current));
    setClean((current) => (draft === null || JSON.stringify(draft) === current ? JSON.stringify(initial) : current));
    // Only a new copy of the task re-seeds the form.
  }, [initial]);

  if (!task || !draft) {
    return (
      <Screen refreshing={loading} onRefresh={refresh}>
        <Card>
          <EmptyState icon="check-circle">{loading ? t.loading : t.taskNotFound}</EmptyState>
        </Card>
      </Screen>
    );
  }

  const dirty = JSON.stringify(draft) !== clean;
  const set = (changes: Partial<Draft>) => {
    setError(null);
    setDraft({ ...draft, ...changes });
  };

  const save = async () => {
    if (!draft.title.trim()) return setError(t.taskTitlePh);
    const changes = changesFrom(task, draft);
    if (!changes) return setError(t.badTime);
    if (Object.keys(changes).length && !(await act(() => apiUpdate(getApi(), "/tasks", task.id, changes)))) return;
    setClean(JSON.stringify(draft));
    toast(t.saved);
  };

  const chooseDay = async () => {
    const picked = await pickDate(t.due, draft.day ? `${draft.day}T12:00:00` : null);
    if (picked) set({ day: picked });
  };

  const addList = async () => {
    const created = newList ? await actions.createList(newList) : null;
    if (created) set({ listId: created.id });
    if (created || !newList?.trim()) setNewList(null);
  };

  const addStep = async () => {
    const title = newStep.trim();
    if (!title) return;
    if (await act(() => getApi().post("/task-steps", { task_id: task.id, title, position: nextStepPosition(steps) }))) setNewStep("");
  };

  const done = steps.filter((step) => step.done).length;
  const repeatOptions = ["never", ...recurrences] as const;

  return (
    <Screen stackAction={dirty ? { label: t.saveChanges, onPress: () => void save() } : undefined} refreshing={loading} onRefresh={refresh}>
      <View style={{ gap: 6 }}>
        <Input value={draft.title} onChangeText={(title) => set({ title })} placeholder={t.taskTitlePh} maxLength={220} multiline returnKeyType="done" blurOnSubmit style={styles.title} accessibilityLabel={t.taskTitlePh} />
        <Input value={draft.notes} onChangeText={(notes) => set({ notes })} placeholder={t.notesPh} multiline style={styles.notes} accessibilityLabel={t.notesPh} />
        {dirty ? <Text style={[type.hint, { color: colors.accent }]}>● {t.unsaved}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Card title={t.due}>
        <View style={styles.dueRow}>
          <Pressable onPress={() => void chooseDay()} accessibilityRole="button" accessibilityLabel={t.due} style={({ pressed }) => [styles.field, styles.dayField, pressed && { opacity: 0.7 }]}>
            <Icon name="calendar" size={15} color={colors.inkMuted} />
            <Text style={type.rowTitle}>{draft.day ? formatDate(`${draft.day}T12:00:00`, { weekday: "short", day: "numeric", month: "short" }) : t.clearDate}</Text>
          </Pressable>
          {draft.day ? (
            <>
              <Input value={draft.time} onChangeText={(time) => set({ time })} placeholder="09:00" keyboardType="numbers-and-punctuation" maxLength={5} accessibilityLabel={t.timeLabel} style={styles.time} />
              <RowButton icon="x" outline label={t.clearDate} onPress={() => set({ day: null, lead: draft.lead === "custom" ? "custom" : "none" })} />
            </>
          ) : null}
        </View>
        {draft.day ? (
          <>
            <Text style={type.sectionLabel}>{t.reminder}</Text>
            <Chips options={[...REMINDER_LEADS, ...(draft.lead === "custom" ? (["custom"] as const) : [])]} value={draft.lead} onChange={(lead) => set({ lead })} label={(lead) => t.leadNames[lead]} />
          </>
        ) : null}
      </Card>

      <Card title={t.list}>
        <Chips options={["", ...lists.map((list) => list.id)]} value={draft.listId ?? ""} onChange={(listId) => set({ listId: listId || null })} label={(key) => (key ? (lists.find((list) => list.id === key)?.name ?? "") : t.noList)}>
          {newList === null ? <Chip label={`+ ${t.newList}`} onPress={() => setNewList("")} /> : null}
        </Chips>
        {newList !== null ? (
          <View style={styles.inline}>
            <Input value={newList} onChangeText={setNewList} placeholder={t.listNamePh} maxLength={60} autoFocus returnKeyType="done" onSubmitEditing={() => void addList()} style={{ flex: 1 }} />
            <RowButton label={t.add} onPress={() => void addList()} />
          </View>
        ) : null}
      </Card>

      <Card title={`${repeatGlyph} ${t.repeat}`}>
        <Chips options={repeatOptions} value={draft.recurrence} onChange={(recurrence) => set({ recurrence })} label={(key) => (key === "never" ? t.never : t.recurrenceNames[key])} />
        {draft.recurrence !== "never" ? <Text style={type.rowSubtitle}>{t.repeatsHint}</Text> : null}
      </Card>

      <Card title={t.priority}>
        <Chips options={["low", "normal", "high"] as const} value={draft.priority} onChange={(priority) => set({ priority })} label={(key) => t.priorityNames[key]} />
      </Card>

      <Card title={t.checklist} action={steps.length ? <Text style={type.sectionLabel}>{`${formatNumber(done)}/${formatNumber(steps.length)}`}</Text> : undefined}>
        {steps.map((step) => (
          <View key={step.id} style={styles.step}>
            <CheckItem size={24} checked={step.done} label={step.title} onPress={() => void act(() => apiUpdate(getApi(), "/task-steps", step.id, { done: !step.done }))} />
            <Text style={[type.rowTitle, { flex: 1 }, step.done && styles.struck]}>{step.title}</Text>
            <Pressable onPress={() => void act(() => getApi().delete(`/task-steps/${encodeURIComponent(step.id)}`))} accessibilityRole="button" accessibilityLabel={`${t.delete}: ${step.title}`} hitSlop={8} style={styles.stepDelete}>
              <Icon name="x" size={15} color={colors.inkFaint} />
            </Pressable>
          </View>
        ))}
        <View style={styles.inline}>
          <Input value={newStep} onChangeText={setNewStep} placeholder={t.stepPh} maxLength={220} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={() => void addStep()} style={{ flex: 1 }} />
          <RowButton icon="plus" label={t.add} onPress={() => void addStep()} disabled={!newStep.trim()} />
        </View>
      </Card>

      <View style={styles.actions}>
        {dirty ? <Button title={t.saveChanges} variant="primary" onPress={() => void save()} /> : null}
        <Button title={`✓ ${t.complete}`} variant={dirty ? "dark" : "primary"} onPress={() => void actions.complete(task).then((ok) => ok && router.back())} />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Button title={`◷ ${t.snoozeTo}`} variant="outline" onPress={() => actions.snooze(task)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={`✕ ${t.deleteTask}`} variant="outline" onPress={() => actions.remove(task, () => router.back())} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, minHeight: 52 },
  notes: { minHeight: 64, textAlignVertical: "top" },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.dangerOnShell },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { minHeight: 44, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 12, justifyContent: "center" },
  dayField: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  time: { width: 84, textAlign: "center", fontFamily: fonts.medium },
  inline: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.hairline },
  stepDelete: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  struck: { textDecorationLine: "line-through", color: colors.inkMuted },
  actions: { gap: 10, paddingTop: 8 },
  pair: { flexDirection: "row", gap: 10 }
});
