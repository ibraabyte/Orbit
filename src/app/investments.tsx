import { useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, Hero, ListRow, Metric, RowButton, type } from "@/components/drift";
import { AmountEditor, AmountField, ChoiceButton, FieldLabel, FormButtons } from "@/components/money-form";
import { useOverlays } from "@/components/overlays";
import { Input, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { formatMoney, mainCurrency } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import type { Investment, InvestmentKind } from "@/lib/types";
import { formatPercent, investmentReturn, investmentTotals, parseMoneyInput } from "@/lib/wealth";

const kinds: InvestmentKind[] = ["stocks", "funds", "sukuk", "crowdfunding", "real_estate", "crypto", "gold", "savings", "other"];
type Editing = { id: string; field: "value" | "add" };
const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`, { day: "numeric", month: "short", year: "numeric" });

// Each investment app or portfolio: what went in, what it is worth now, and the return.
export default function Investments() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast, pickDate } = useOverlays();
  const currency = mainCurrency(data.expenses, data.bills);
  const totals = investmentTotals(data.investments, currency);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<InvestmentKind>("funds");
  const [invested, setInvested] = useState("");
  const [value, setValue] = useState("");
  const [startedOn, setStartedOn] = useState<string | null>(null);
  const investedAmount = parseMoneyInput(invested);
  // An empty current value means "the same as what went in".
  const valueAmount = value.trim() ? parseMoneyInput(value) : investedAmount;
  const ready = Boolean(name.trim()) && investedAmount !== null && valueAmount !== null;

  const save = (id: string, body: Record<string, unknown>) => {
    setEditing(null);
    void act(() => apiUpdate(getApi(), "/investments", id, body)).then(() => toast(t.saved));
  };
  const add = () => {
    if (!ready) return;
    void act(() => getApi().post("/investments", { name: name.trim(), kind, invested: investedAmount, current_value: valueAmount, currency, started_on: startedOn })).then(() => toast(t.saved));
    setAdding(false);
    setName("");
    setInvested("");
    setValue("");
    setStartedOn(null);
  };
  const open = (investment: Investment) =>
    sheet({
      title: investment.name,
      options: [
        { label: t.updateValue, run: () => setEditing({ id: investment.id, field: "value" }) },
        { label: t.addMoney, run: () => setEditing({ id: investment.id, field: "add" }) },
        { label: t.delete, destructive: true, run: () => void act(() => getApi().delete(`/investments/${encodeURIComponent(investment.id)}`)) }
      ]
    });

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Hero style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <View style={{ gap: 4 }}>
          <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{t.currentValue}</Text>
          <Text style={[type.h1, { color: colors.heroInk }]}>{formatMoney(totals.value, currency)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Metric onLime label={t.invested} value={formatMoney(totals.invested, currency)} />
          </View>
          <View style={{ flex: 1 }}>
            <Metric onLime label={t.returnLabel} value={`${totals.gain >= 0 ? "+" : "−"}${formatMoney(Math.abs(totals.gain), currency)}`} unit={formatPercent(totals.percent)} />
          </View>
        </View>
      </Hero>
      <Card title={t.investments}>
        {data.investments.map((investment, index) => {
          const { gain, percent } = investmentReturn(investment);
          if (editing?.id === investment.id) {
            const adding = editing.field === "add";
            return (
              <AmountEditor
                key={investment.id}
                label={`${investment.name} · ${adding ? t.addMoney : t.currentValue}`}
                currency={investment.currency}
                initial={adding ? "" : String(investment.current_value)}
                allowZero={!adding}
                onCancel={() => setEditing(null)}
                onSave={(amount) =>
                  save(
                    investment.id,
                    // Money added raises both what went in and what it is worth, so the return stays the same.
                    adding ? { invested: Number(investment.invested) + amount, current_value: Number(investment.current_value) + amount } : { current_value: amount }
                  )
                }
              />
            );
          }
          return (
            <ListRow
              key={investment.id}
              first={index === 0}
              title={investment.name}
              badges={
                <>
                  <Badge>{t.investmentKinds[investment.kind]}</Badge>
                  <Badge tone={gain > 0 ? "success" : gain < 0 ? "urgent" : "neutral"} glyph={gain > 0 ? "▲" : gain < 0 ? "▼" : "="}>
                    {formatPercent(percent)}
                  </Badge>
                </>
              }
              subtitle={[
                `${t.invested} ${formatMoney(Number(investment.invested), investment.currency)}`,
                investment.started_on ? `${t.since} ${day(investment.started_on)}` : null,
                `${t.valuedOn} ${formatDate(investment.valued_at)}`
              ]
                .filter(Boolean)
                .join(" · ")}
              meta={formatMoney(Number(investment.current_value), investment.currency)}
              onPress={() => open(investment)}
            />
          );
        })}
        {!data.investments.length && !adding ? <EmptyState icon="trending-up">{t.investEmpty}</EmptyState> : null}
        {adding ? (
          <View style={{ gap: 8 }}>
            <Input placeholder={t.name} value={name} onChangeText={setName} autoFocus />
            <ChoiceButton title={t.kindLabel} value={kind} options={kinds} labels={t.investmentKinds} onChange={setKind} />
            <FieldLabel>{t.invested}</FieldLabel>
            <AmountField label={t.invested} value={invested} onChange={setInvested} currency={currency} />
            <FieldLabel>{`${t.currentValue} (${t.optional})`}</FieldLabel>
            <AmountField label={t.currentValue} value={value} onChange={setValue} currency={currency} onSubmit={add} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[type.rowSubtitle, { flex: 1 }]}>{`${t.startedOn} (${t.optional})`}</Text>
              <RowButton outline label={startedOn ? day(startedOn) : t.enterDate} onPress={() => void pickDate(t.startedOn, startedOn).then((date) => date && setStartedOn(date))} />
            </View>
            <FormButtons onCancel={() => setAdding(false)} onSave={add} disabled={!ready} />
          </View>
        ) : (
          <RowButton icon="plus" label={t.addInvestment} onPress={() => setAdding(true)} />
        )}
      </Card>
    </Screen>
  );
}
