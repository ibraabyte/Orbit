import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Badge, Card, EmptyState, ProgressBar, RowButton, type, type BadgeTone, type Fold } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input } from "@/components/screen";
import { colors } from "@/components/theme";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { budgetProgress, budgetsToCopy, financeCategories, formatMoney, monthKey, parseBudgetAmount, shiftMonth, type BudgetProgress, type BudgetState } from "@/lib/finance";
import { formatDate, isArabic, t } from "@/lib/i18n";
import type { Budget, Expense, FinanceCategory } from "@/lib/types";

// State is always written out, with a glyph; the bar colour only backs it up.
const states: Record<BudgetState, { tone: BadgeTone; glyph: string; label: string; bar: string }> = {
  ok: { tone: "success", glyph: "✓", label: t.budgetStateOk, bar: colors.accent },
  near: { tone: "accent", glyph: "◐", label: t.budgetStateNear, bar: colors.accentDeep },
  over: { tone: "urgent", glyph: "!", label: t.budgetStateOver, bar: colors.dangerOnShell }
};

type Editing = { category: FinanceCategory; currency: string; id?: string };

// Limits for one month at a time: this month, the one before, and the one after (to prepare it).
export function BudgetCard({ budgets, expenses, currency, refresh, fold }: { budgets: Budget[]; expenses: Expense[]; currency: string; refresh: () => Promise<unknown>; fold?: Fold }) {
  const { sheet, toast } = useOverlays();
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const month = shiftMonth(monthKey(new Date()), offset);
  const rows = budgetProgress(budgets, expenses, month);
  // Offered whenever something is left to copy, so a copy that stopped half way can be finished.
  const copyable = budgetsToCopy(budgets, month);
  const free = financeCategories.filter((category) => !rows.some((row) => row.budget.category === category));
  const parsed = parseBudgetAmount(amount);

  const move = (by: number) => {
    setOffset(Math.max(-1, Math.min(1, offset + by)));
    setEditing(null);
  };
  const edit = (next: Editing, current = "") => {
    setAmount(current);
    setEditing(next);
  };
  // One write at a time, so a double tap cannot post the same limit twice. The toast is only for a write that worked;
  // either way the list is reloaded, so a copy that failed half way shows what did get through.
  const run = async (write: () => PromiseLike<unknown>, done: string) => {
    setBusy(true);
    try {
      await write();
      toast(done);
    } catch (error) {
      Alert.alert(t.budgetFailed, error instanceof Error ? error.message : t.error);
    }
    await refresh();
    setBusy(false);
  };

  const save = () => {
    if (!editing || parsed === null) return;
    const write = editing.id
      ? () => apiUpdate(getApi(), "/budgets", editing.id as string, { amount: parsed })
      : () => getApi().post("/budgets", { month, category: editing.category, amount: parsed, currency: editing.currency });
    setEditing(null);
    void run(write, t.budgetSaved);
  };
  const copy = () =>
    void run(async () => {
      for (const row of copyable) await getApi().post("/budgets", { month, category: row.category, amount: row.amount, currency: row.currency });
    }, t.budgetCopied);
  const open = ({ budget, limit }: BudgetProgress) =>
    sheet({
      title: t.financeCategoryNames[budget.category],
      options: [
        { label: t.budgetChange, run: () => edit({ category: budget.category, currency: budget.currency, id: budget.id }, String(limit)) },
        { label: t.delete, destructive: true, run: () => void run(() => getApi().delete(`/budgets/${encodeURIComponent(budget.id)}`), t.budgetDeleted) }
      ]
    });
  const pick = () =>
    sheet({ title: t.budgetPickCategory, options: free.map((category) => ({ label: t.financeCategoryNames[category], run: () => edit({ category, currency }) })) });

  return (
    <Card title={t.budget} fold={fold}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <RowButton outline disabled={offset <= -1} icon={isArabic ? "chevron-right" : "chevron-left"} label={t.budgetPrevMonth} onPress={() => move(-1)} />
        <Text style={[type.title, { flex: 1, textAlign: "center" }]} accessibilityRole="header">
          {formatDate(`${month}T12:00:00`, { month: "long", year: "numeric" })}
        </Text>
        <RowButton outline disabled={offset >= 1} icon={isArabic ? "chevron-left" : "chevron-right"} label={t.budgetNextMonth} onPress={() => move(1)} />
      </View>
      {rows.map((row) => {
        const { budget, spent, limit, ratio, state } = row;
        const name = t.financeCategoryNames[budget.category];
        const shown = states[state];
        const figures = `${formatMoney(spent, budget.currency)} / ${formatMoney(limit, budget.currency)}`;
        const left = limit >= spent ? `${formatMoney(limit - spent, budget.currency)} ${t.budgetLeft}` : `${formatMoney(spent - limit, budget.currency)} ${t.budgetOverBy}`;
        return (
          <Pressable key={budget.id} accessibilityRole="button" accessibilityLabel={`${name}, ${shown.label}, ${figures}`} onPress={() => open(row)} style={({ pressed }) => [{ gap: 6, paddingVertical: 6 }, pressed && { opacity: 0.7 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[type.barLabel, { flex: 1 }]} numberOfLines={1}>{name}</Text>
              <Badge tone={shown.tone} glyph={shown.glyph}>{shown.label}</Badge>
            </View>
            <ProgressBar value={Math.min(ratio, 1)} max={1} color={shown.bar} height={10} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={type.rowSubtitle}>{figures}</Text>
              <Text style={type.rowSubtitle}>{left}</Text>
            </View>
          </Pressable>
        );
      })}
      {!rows.length && !editing ? <EmptyState>{t.budgetEmpty}</EmptyState> : null}
      {copyable.length ? <Button variant="outline" title={t.budgetCopy} disabled={busy} onPress={copy} /> : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          {/* The currency is shown beside the amount, so a wrong one is seen before saving. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input accessibilityLabel={`${t.budgetAmount} (${editing.currency}): ${t.financeCategoryNames[editing.category]}`} placeholder={`${t.financeCategoryNames[editing.category]} · ${t.budgetAmount}`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={save} autoFocus />
            </View>
            <Text style={type.barValue}>{editing.currency}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button variant="outline" title={t.cancel} onPress={() => setEditing(null)} /></View>
            <View style={{ flex: 1 }}><Button variant="primary" title={t.save} disabled={parsed === null || busy} onPress={save} /></View>
          </View>
        </View>
      ) : free.length ? (
        <RowButton label={t.budgetAdd} icon="plus" onPress={pick} />
      ) : (
        <Text style={type.rowSubtitle}>{t.budgetAllSet}</Text>
      )}
    </Card>
  );
}
