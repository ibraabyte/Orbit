import { useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, RowButton, type } from "@/components/drift";
import { FormButtons } from "@/components/money-form";
import { useOverlays } from "@/components/overlays";
import { Input, Screen, Segments } from "@/components/screen";
import { useCardPicker } from "@/hooks/use-card-picker";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { activeSubscriptions, formatMoney, mainCurrency } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import type { CardKind, CardNetwork, PaymentCard } from "@/lib/types";
import { cardExpiryState, cardLabel, cardSubscriptions, formatCardExpiry, normalizeLast4, parseCardExpiry } from "@/lib/wealth";

const networks: CardNetwork[] = ["mada", "visa", "mastercard", "amex", "other"];
const cardKinds: CardKind[] = ["credit", "debit", "prepaid"];
const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

// Each card with the subscriptions charged to it and their monthly total. Only the last four digits are ever kept.
export default function Cards() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast } = useOverlays();
  const pickCard = useCardPicker();
  const currency = mainCurrency(data.expenses, data.bills);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState<CardNetwork>("mada");
  const [kind, setKind] = useState<CardKind>("debit");
  const [last4, setLast4] = useState("");
  const [expiry, setExpiry] = useState("");
  const digits = normalizeLast4(last4);
  const expiresOn = expiry.trim() ? parseCardExpiry(expiry) : null;
  const ready = Boolean(name.trim()) && digits !== null && (!expiry.trim() || expiresOn !== null);
  const unlinked = activeSubscriptions(data.bills).filter((bill) => !bill.card_id || !data.cards.some((card) => card.id === bill.card_id));

  const add = () => {
    if (!ready) return;
    void act(() => getApi().post("/cards", { name: name.trim(), network, kind, last4: digits, expires_on: expiresOn })).then(() => toast(t.saved));
    setAdding(false);
    setName("");
    setLast4("");
    setExpiry("");
  };
  const open = (card: PaymentCard) =>
    sheet({
      title: cardLabel(card),
      options: [{ label: t.delete, destructive: true, run: () => void act(() => getApi().delete(`/cards/${encodeURIComponent(card.id)}`)) }]
    });

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      {data.cards.map((card) => {
        const { bills, monthly } = cardSubscriptions(data.bills, card.id);
        const expiryState = cardExpiryState(card);
        const expires = formatCardExpiry(card.expires_on);
        return (
          <Card key={card.id} action={<Text style={type.barValue}>{`${t.monthlyTotal} ${formatMoney(monthly, currency)}`}</Text>}>
            <ListRow
              first
              leading={<IconTile name="credit-card" size={36} tone={expiryState === "expired" ? "urgent" : "accent"} />}
              title={card.name}
              titleExtra={`•••• ${card.last4}`}
              badges={
                <>
                  <Badge>{t.cardNetworks[card.network]}</Badge>
                  <Badge>{t.cardKinds[card.kind]}</Badge>
                  {expiryState === "expired" ? <Badge tone="urgent" glyph="!">{t.expired}</Badge> : expiryState === "soon" ? <Badge tone="accent" glyph="◷">{t.expiresSoon}</Badge> : null}
                </>
              }
              subtitle={expires ? `${t.expires} ${expires}` : null}
              onPress={() => open(card)}
            />
            {bills.map((bill) => (
              <ListRow key={bill.id} title={bill.name} subtitle={`${t.renews} ${day(bill.due_at)}`} meta={formatMoney(Number(bill.amount), bill.currency)} onPress={() => pickCard(bill)} />
            ))}
            {!bills.length ? <Text style={type.rowSubtitle}>{t.noSubsOnCard}</Text> : null}
          </Card>
        );
      })}
      {unlinked.length && data.cards.length ? (
        <Card title={t.subsWithoutCard}>
          {unlinked.map((bill, index) => (
            <ListRow key={bill.id} first={index === 0} title={bill.name} subtitle={`${t.renews} ${day(bill.due_at)}`} meta={formatMoney(Number(bill.amount), bill.currency)} trailing={<RowButton label={t.chooseCard} onPress={() => pickCard(bill)} />} />
          ))}
        </Card>
      ) : null}
      <Card title={adding ? t.addCard : undefined}>
        {!data.cards.length && !adding ? <EmptyState icon="credit-card">{t.cardsEmpty}</EmptyState> : null}
        {adding ? (
          <View style={{ gap: 8 }}>
            <Input placeholder={t.name} value={name} onChangeText={setName} autoFocus />
            <Segments small options={networks} value={network} onChange={setNetwork} labels={t.cardNetworks} />
            <Segments small options={cardKinds} value={kind} onChange={setKind} labels={t.cardKinds} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* Four characters at most, so a full card number can't be typed in. */}
              <Input style={{ flex: 1 }} placeholder={t.last4} accessibilityLabel={t.last4} value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} autoComplete="off" textContentType="none" />
              <Input style={{ flex: 1 }} placeholder={t.expiry} accessibilityLabel={t.expiry} value={expiry} onChangeText={setExpiry} keyboardType="numbers-and-punctuation" maxLength={7} autoComplete="off" textContentType="none" />
            </View>
            <Text style={type.rowSubtitle}>{t.cardPrivacy}</Text>
            <FormButtons onCancel={() => setAdding(false)} onSave={add} disabled={!ready} />
          </View>
        ) : (
          <RowButton icon="plus" label={t.addCard} onPress={() => setAdding(true)} />
        )}
      </Card>
    </Screen>
  );
}
