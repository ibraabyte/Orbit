import { useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, Hero, ListRow, RowButton, type } from "@/components/drift";
import { AmountEditor, AmountField, ChoiceButton, FieldLabel, FormButtons } from "@/components/money-form";
import { useOverlays } from "@/components/overlays";
import { Input, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { formatMoney, mainCurrency } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import type { MoneyAccount, MoneyAccountKind } from "@/lib/types";
import { moneyTotal, parseMoneyInput } from "@/lib/wealth";

const kinds: MoneyAccountKind[] = ["bank", "savings", "wallet", "cash", "other"];

// Where my money is: each account, wallet or cash pile with the balance last typed, and the total.
export default function Accounts() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast } = useOverlays();
  const currency = mainCurrency(data.expenses, data.bills);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MoneyAccountKind>("bank");
  const [balance, setBalance] = useState("");
  const amount = parseMoneyInput(balance, { allowNegative: true });
  const accounts = data.moneyAccounts;

  const add = () => {
    if (!name.trim() || amount === null) return;
    void act(() => getApi().post("/money-accounts", { name: name.trim(), kind, balance: amount, currency })).then(() => toast(t.saved));
    setAdding(false);
    setName("");
    setBalance("");
  };
  const open = (account: MoneyAccount) =>
    sheet({
      title: account.name,
      options: [
        { label: t.updateBalance, run: () => setEditing(account.id) },
        { label: t.delete, destructive: true, run: () => void act(() => getApi().delete(`/money-accounts/${encodeURIComponent(account.id)}`)) }
      ]
    });

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Hero style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{t.totalMoney}</Text>
        <Text style={[type.h1, { color: colors.heroInk }]}>{formatMoney(moneyTotal(accounts, currency), currency)}</Text>
      </Hero>
      <Card title={t.moneyPlaces}>
        {accounts.map((account, index) =>
          editing === account.id ? (
            <AmountEditor
              key={account.id}
              label={`${account.name} · ${t.balance}`}
              currency={account.currency}
              initial={String(account.balance)}
              allowNegative
              onCancel={() => setEditing(null)}
              onSave={(next) => {
                setEditing(null);
                void act(() => apiUpdate(getApi(), "/money-accounts", account.id, { balance: next })).then(() => toast(t.saved));
              }}
            />
          ) : (
            <ListRow
              key={account.id}
              first={index === 0}
              title={account.name}
              badges={<Badge>{t.accountKinds[account.kind]}</Badge>}
              subtitle={formatDate(account.updated_at)}
              meta={formatMoney(Number(account.balance), account.currency)}
              onPress={() => open(account)}
            />
          )
        )}
        {!accounts.length && !adding ? <EmptyState>{t.moneyEmpty}</EmptyState> : null}
        {adding ? (
          <View style={{ gap: 8 }}>
            <Input placeholder={t.name} value={name} onChangeText={setName} autoFocus />
            <ChoiceButton title={t.kindLabel} value={kind} options={kinds} labels={t.accountKinds} onChange={setKind} />
            <FieldLabel>{t.balance}</FieldLabel>
            <AmountField label={t.balance} value={balance} onChange={setBalance} currency={currency} onSubmit={add} />
            <FormButtons onCancel={() => setAdding(false)} onSave={add} disabled={!name.trim() || amount === null} />
          </View>
        ) : (
          <RowButton icon="plus" label={t.addMoneyPlace} onPress={() => setAdding(true)} />
        )}
      </Card>
    </Screen>
  );
}
