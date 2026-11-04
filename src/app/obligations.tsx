import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Badge, Card, CheckItem, EmptyState, Hero, ListRow, MoreButton, ProgressBar, RowButton, type } from "@/components/drift";
import { AmountField, ChoiceButton, FieldLabel, FormButtons } from "@/components/money-form";
import { toDateKey, useOverlays } from "@/components/overlays";
import { Input, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { formatMoney, mainCurrency } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import { localDateKey } from "@/lib/insights";
import type { ObligationInstallment, ObligationKind } from "@/lib/types";
import { buildInstallmentSchedule, obligationsProgress, obligationsRemaining, parseMoneyInput, type InstallmentEvery, type ObligationProgress } from "@/lib/wealth";

const kinds: ObligationKind[] = ["bnpl", "installment", "loan", "other"];
const everyOptions: InstallmentEvery[] = ["month", "two_weeks", "week"];
const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`, { day: "numeric", month: "short", year: "numeric" });
// Upcoming payments shown before "Show all".
const preview = 3;

// Pay-later plans, installments and loans: what is left, the next payment, and a tap to mark one paid.
export default function Obligations() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast, pickDate } = useOverlays();
  const currency = mainCurrency(data.expenses, data.bills);
  const plans = obligationsProgress(data);
  const [open, setOpen] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [kind, setKind] = useState<ObligationKind>("bnpl");
  const [total, setTotal] = useState("");
  const [count, setCount] = useState("4");
  const [every, setEvery] = useState<InstallmentEvery>("month");
  const [firstDue, setFirstDue] = useState(toDateKey(new Date()));
  const [paidFirst, setPaidFirst] = useState(true);
  const totalAmount = parseMoneyInput(total, { allowZero: false });
  const countNumber = Number((count.trim() || "0").replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)));
  const schedule = totalAmount ? buildInstallmentSchedule({ total: totalAmount, count: countNumber, firstDue, every, paidFirst }) : [];
  const ready = Boolean(name.trim()) && schedule.length > 0;

  const add = () => {
    if (!ready || !totalAmount) return;
    const body = { name: name.trim(), provider: provider.trim() || null, kind, total_amount: totalAmount, currency, installments: schedule };
    void act(() => getApi().post("/obligations/plan", body)).then(() => toast(t.saved));
    setAdding(false);
    setName("");
    setProvider("");
    setTotal("");
  };
  const setPaid = (installment: ObligationInstallment, paid: boolean) =>
    void act(() => apiUpdate(getApi(), "/obligation-installments", installment.id, { paid_at: paid ? new Date().toISOString() : null })).then(() => toast(t.saved));
  const menu = ({ obligation }: ObligationProgress) =>
    sheet({ title: obligation.name, options: [{ label: t.delete, destructive: true, run: () => void act(() => getApi().delete(`/obligations/${encodeURIComponent(obligation.id)}`)) }] });
  const toggle = (id: string) => setOpen(open.includes(id) ? open.filter((item) => item !== id) : [...open, id]);
  const today = localDateKey(new Date());

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Hero style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{t.owed}</Text>
        <Text style={[type.h1, { color: colors.heroInk }]}>{formatMoney(obligationsRemaining(data, currency), currency)}</Text>
      </Hero>
      {plans.map((plan) => {
        const { obligation, installments, paid, remaining, paidCount, count: total, next, overdue, done } = plan;
        const expanded = open.includes(obligation.id);
        // Unpaid first in date order, then the paid ones; collapsed shows only the next few unpaid.
        const unpaid = installments.filter((row) => !row.paid_at);
        const shown = expanded ? installments : unpaid.slice(0, preview);
        return (
          <Card key={obligation.id} title={obligation.name} action={<MoreButton label={t.delete} onPress={() => menu(plan)} />}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Badge>{t.obligationKinds[obligation.kind]}</Badge>
              {obligation.provider ? <Badge>{obligation.provider}</Badge> : null}
              {done ? <Badge tone="success" glyph="✓">{t.paidOff}</Badge> : overdue.length ? <Badge tone="urgent" glyph="!">{`${overdue.length} ${t.overdue}`}</Badge> : null}
            </View>
            <ProgressBar value={paid} max={Math.max(paid + remaining, 0.01)} height={10} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={type.rowSubtitle}>{`${paidCount}/${total} ${t.paymentsPaid}`}</Text>
              <Text style={type.barValue}>{`${t.remaining} ${formatMoney(remaining, obligation.currency)}`}</Text>
            </View>
            {next && !expanded ? <Text style={type.rowSubtitle}>{`${t.nextPayment}: ${day(next.due_on)} · ${formatMoney(Number(next.amount), obligation.currency)}`}</Text> : null}
            {shown.map((installment) => {
              const late = !installment.paid_at && installment.due_on.slice(0, 10) < today;
              return (
                <ListRow
                  key={installment.id}
                  leading={<CheckItem checked={Boolean(installment.paid_at)} label={`${t.installment} ${day(installment.due_on)}`} onPress={() => setPaid(installment, !installment.paid_at)} />}
                  title={day(installment.due_on)}
                  badges={late ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : installment.due_on.slice(0, 10) === today && !installment.paid_at ? <Badge tone="accent" glyph="◷">{t.dueToday}</Badge> : null}
                  meta={formatMoney(Number(installment.amount), obligation.currency)}
                />
              );
            })}
            {installments.length > preview || paidCount ? (
              <Pressable accessibilityRole="button" onPress={() => toggle(obligation.id)} style={{ paddingVertical: 6 }}>
                <Text style={[type.pill, { textAlign: "center" }]}>{expanded ? t.showLess : t.showAll}</Text>
              </Pressable>
            ) : null}
          </Card>
        );
      })}
      <Card title={adding ? t.addObligation : undefined}>
        {!plans.length && !adding ? <EmptyState>{t.obligationsEmpty}</EmptyState> : null}
        {adding ? (
          <View style={{ gap: 8 }}>
            <Input placeholder={t.name} value={name} onChangeText={setName} autoFocus />
            <Input placeholder={`${t.provider} (${t.optional})`} value={provider} onChangeText={setProvider} />
            <ChoiceButton title={t.kindLabel} value={kind} options={kinds} labels={t.obligationKinds} onChange={setKind} />
            <FieldLabel>{t.totalAmount}</FieldLabel>
            <AmountField label={t.totalAmount} value={total} onChange={setTotal} currency={currency} />
            <FieldLabel>{t.paymentsCount}</FieldLabel>
            <Input placeholder={t.paymentsCount} accessibilityLabel={t.paymentsCount} value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={3} />
            <ChoiceButton title={t.every} value={every} options={everyOptions} labels={t.installmentEvery} onChange={setEvery} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[type.rowSubtitle, { flex: 1 }]}>{t.firstPayment}</Text>
              <RowButton outline label={day(firstDue)} onPress={() => void pickDate(t.firstPayment, firstDue).then((date) => date && setFirstDue(date))} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <CheckItem checked={paidFirst} label={t.firstPaidNow} onPress={() => setPaidFirst(!paidFirst)} />
              <Text style={[type.rowSubtitle, { flex: 1 }]}>{t.firstPaidNow}</Text>
            </View>
            {schedule.length ? <Text style={type.barValue}>{`${schedule.length} ${t.schedulePreview} ${formatMoney(schedule[schedule.length - 1].amount, currency)} · ${day(schedule[0].due_on)} → ${day(schedule[schedule.length - 1].due_on)}`}</Text> : null}
            <FormButtons onCancel={() => setAdding(false)} onSave={add} disabled={!ready} />
          </View>
        ) : (
          <RowButton icon="plus" label={t.addObligation} onPress={() => setAdding(true)} />
        )}
      </Card>
    </Screen>
  );
}
