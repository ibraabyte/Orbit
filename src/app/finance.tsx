import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section, Stats } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { activeSubscriptions, financeSummary, formatMoney, nextBillDueDate, spendingByCategory, subscriptionMonthlyTotal } from "@/lib/finance";
import { getSupabase } from "@/lib/supabase";
import type { Bill } from "@/lib/types";

export default function Finance() {
  const { userId, data, loading, refresh, act } = useDashboardData();
  const finance = financeSummary(data);
  // ponytail: totals assume one currency, same as the web app.
  const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
  const bills = [...finance.overdueBills, ...finance.upcomingBills];
  const subscriptions = activeSubscriptions(data.bills);

  const markPaid = (bill: Bill) => {
    const nextDue = nextBillDueDate(bill);
    const update = nextDue ? { due_at: nextDue, status: "active" as const } : { status: "paid" as const };
    return act(() => getSupabase().from("bills").update(update).eq("id", bill.id).eq("user_id", userId));
  };

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      <Stats
        items={[
          ["This month", formatMoney(finance.monthSpend, currency)],
          ["Today", formatMoney(finance.todaySpend, currency)],
          ["Monthly bills", formatMoney(finance.monthlyCommitments, currency)]
        ]}
      />
      <Section title="Bills">
        {bills.length ? (
          bills.map((bill) => (
            <Row key={bill.id} title={bill.name} detail={`Due ${bill.due_at}${bill.autopay ? " · autopay" : ""}`} tone={finance.overdueBills.includes(bill) ? "danger" : "neutral"} right={formatMoney(bill.amount, bill.currency)} onPress={() => markPaid(bill)} />
          ))
        ) : (
          <Empty>No bills due in 30 days.</Empty>
        )}
      </Section>
      <Section title={`Subscriptions · ${formatMoney(subscriptionMonthlyTotal(data.bills), currency)}/mo`}>
        {subscriptions.length ? (
          subscriptions.map((bill) => <Row key={bill.id} title={bill.name} detail={`Renews ${bill.due_at}`} right={formatMoney(bill.amount, bill.currency)} />)
        ) : (
          <Empty>Add one: "subscription netflix 45".</Empty>
        )}
      </Section>
      <Section title="By category this month">
        {spendingByCategory(data.expenses).map((row) => (
          <Row key={row.category} title={row.category} detail={`${row.count} expenses`} right={formatMoney(row.total, currency)} />
        ))}
      </Section>
      <Section title="Recent">
        {data.expenses.slice(0, 10).map((expense) => (
          <Row key={expense.id} title={expense.merchant} detail={`${expense.category} · ${new Date(expense.spent_at).toLocaleDateString()}`} right={formatMoney(expense.amount, expense.currency)} />
        ))}
      </Section>
    </Screen>
  );
}
