import { Text, View } from "react-native";
import { BankReviewCard } from "@/components/bank-review-card";
import { Badge, Card, EmptyState, ListRow, ProgressBar, RowButton, StatGrid, StatTile, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Screen } from "@/components/screen";
import { useBankReview } from "@/hooks/use-bank-review";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { activeSubscriptions, financeSummary, formatMoney, nextBillDueDate, spendingByCategory, subscriptionMonthlyTotal } from "@/lib/finance";
import { formatDate, t } from "@/lib/i18n";
import type { Bill } from "@/lib/types";

const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

export default function Finance() {
  const { data, loading, refresh, act } = useDashboardData();
  const { toast } = useOverlays();
  const review = useBankReview(act);
  const finance = financeSummary(data);
  // ponytail: totals assume one currency, same as the web app.
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const bills = [...finance.overdueBills, ...finance.upcomingBills];
  const subscriptions = activeSubscriptions(data.bills);
  const categories = spendingByCategory(data.expenses);
  const topCategory = Math.max(1, ...categories.map((row) => row.total));

  const markPaid = (bill: Bill) => {
    const nextDue = nextBillDueDate(bill);
    const update = nextDue ? { due_at: nextDue, status: "active" as const } : { status: "paid" as const };
    return act(() => apiUpdate(getApi(), "/bills", bill.id, update)).then(() => toast(t.markPaid));
  };

  return (
    <Screen refreshing={loading} onRefresh={() => Promise.all([refresh(), review.load()])}>
      <StatGrid columns={3}>
        {[
          <StatTile key="month" label={t.spentMonth} value={formatMoney(finance.monthSpend, currency)} size={18} />,
          <StatTile key="today" label={t.spentToday} value={formatMoney(finance.todaySpend, currency)} size={18} />,
          <StatTile key="bills" label={t.monthlyBills} value={formatMoney(finance.monthlyCommitments, currency)} size={18} />
        ]}
      </StatGrid>
      <BankReviewCard items={review.items} failed={review.failed} confirm={review.confirm} ignore={review.ignore} />
      <Card title={t.bills}>
        {bills.length ? (
          bills.map((bill) => (
            <ListRow
              key={bill.id}
              title={bill.name}
              badges={
                <>
                  {finance.overdueBills.includes(bill) ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : isToday(`${bill.due_at}T12:00:00`) ? <Badge tone="accent" glyph="◷">{t.dueToday}</Badge> : <Badge glyph="○">{t.upcoming}</Badge>}
                  {bill.autopay ? <Badge glyph="↻">{t.autopay}</Badge> : null}
                </>
              }
              subtitle={day(bill.due_at)}
              meta={formatMoney(bill.amount, bill.currency)}
              trailing={<RowButton label={t.markPaid} onPress={() => markPaid(bill)} />}
            />
          ))
        ) : (
          <EmptyState example="bill rent 2800 @friday">{t.emptyEx}</EmptyState>
        )}
      </Card>
      <Card title={t.subscriptions} action={<Text style={type.barValue}>{t.monthlyTotal} {formatMoney(subscriptionMonthlyTotal(data.bills), currency)}</Text>}>
        {subscriptions.length ? subscriptions.map((bill) => <ListRow key={bill.id} title={bill.name} subtitle={`${t.renews} ${day(bill.due_at)}`} meta={formatMoney(bill.amount, bill.currency)} />) : <EmptyState example="subscription netflix 45">{t.emptyEx}</EmptyState>}
      </Card>
      <Card title={t.byCategory}>
        {categories.map((row) => (
          <View key={row.category} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={[type.barLabel, { width: 96 }]} numberOfLines={1}>
              {t.financeCategoryNames[row.category]}
            </Text>
            <View style={{ flex: 1 }}>
              <ProgressBar value={row.total} max={topCategory} height={10} />
            </View>
            <Text style={[type.barValue, { width: 72, textAlign: "right" }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(row.total, currency)}
            </Text>
          </View>
        ))}
        {!categories.length ? <EmptyState example="spent 25 lunch">{t.emptyEx}</EmptyState> : null}
      </Card>
      <Card title={t.recentExpenses}>
        {data.expenses.slice(0, 10).map((expense) => (
          <ListRow key={expense.id} title={expense.merchant} subtitle={`${formatDate(expense.spent_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${t.financeCategoryNames[expense.category]}`} meta={`−${formatMoney(expense.amount, expense.currency)}`} />
        ))}
        {!data.expenses.length ? <EmptyState example="spent 25 lunch">{t.emptyEx}</EmptyState> : null}
      </Card>
    </Screen>
  );
}
