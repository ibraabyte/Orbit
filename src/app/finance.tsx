import type { Href } from "expo-router";
import { Text, View } from "react-native";
import { BankReviewCard } from "@/components/bank-review-card";
import { BudgetCard } from "@/components/budget-card";
import { Badge, Card, EmptyState, GoalBar, IconTile, ListRow, ProgressBar, RowButton, StatGrid, StatTile, type, type IconName } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Columns, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useBankReview } from "@/hooks/use-bank-review";
import { useCardPicker } from "@/hooks/use-card-picker";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useFolds } from "@/hooks/use-folds";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { activeSubscriptions, financeSummary, formatMoney, mainCurrency, nextBillDueDate, spendingByCategory, subscriptionMonthlyTotal } from "@/lib/finance";
import { budgetMonthTotal, cardsExpiring, fh, isFoldOpen } from "@/lib/finance-hub";
import { formatDate, t } from "@/lib/i18n";
import type { Bill } from "@/lib/types";
import { cardLabel, formatPercent, obligationsProgress, wealthSummary } from "@/lib/wealth";

const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

// Finance is the one door for money: this month on top, then where the money is, investments, cards and
// installments under it, and bills, the budget and spending as sections that fold away. A section opens by
// itself only when something in it needs you, until you open or close it yourself.
export default function Finance() {
  const { data, loading, refresh, act } = useDashboardData();
  const { toast } = useOverlays();
  const review = useBankReview(act);
  const { folds, toggle } = useFolds("orbit.finance.folds");
  const pickCard = useCardPicker();

  const finance = financeSummary(data);
  // ponytail: totals assume one currency, same as the web app; it is the one most spending is in.
  const currency = mainCurrency(data.expenses, data.bills);
  const bills = [...finance.overdueBills, ...finance.upcomingBills];
  const dueToday = finance.upcomingBills.filter((bill) => isToday(`${bill.due_at}T12:00:00`));
  const subscriptions = activeSubscriptions(data.bills);
  const categories = spendingByCategory(data.expenses);
  const topCategory = Math.max(1, ...categories.map((row) => row.total));
  const wealth = wealthSummary(data, currency);
  const budget = budgetMonthTotal(data.budgets, data.expenses, currency);
  const expiring = cardsExpiring(data.cards);
  const lateInstallments = obligationsProgress(data).reduce((sum, row) => sum + row.overdue.length, 0);

  const cardName = (bill: Bill) => {
    const card = data.cards.find((row) => row.id === bill.card_id);
    return card ? cardLabel(card) : null;
  };
  const markPaid = (bill: Bill) => {
    const nextDue = nextBillDueDate(bill);
    const update = nextDue ? { due_at: nextDue, status: "active" as const } : { status: "paid" as const };
    return act(() => apiUpdate(getApi(), "/bills", bill.id, update)).then(() => toast(t.markPaid));
  };

  const billsNeedYou = finance.overdueBills.length > 0 || dueToday.length > 0;
  const budgetNeedsYou = budget !== null && budget.state !== "ok";
  const billsOpen = isFoldOpen(folds, "bills", billsNeedYou);
  const budgetOpen = isFoldOpen(folds, "budget", budgetNeedsYou);
  const expensesOpen = isFoldOpen(folds, "expenses", false);

  const parts: { href: Href; icon: IconName; title: string; subtitle: string; meta: string; badge?: { tone: "urgent" | "accent"; glyph: string; text: string } }[] = [
    { href: "/accounts", icon: "briefcase", title: t.moneyPlaces, subtitle: fh.moneyPlacesDetail, meta: formatMoney(wealth.cash, currency) },
    {
      href: "/investments",
      icon: "trending-up",
      title: t.investments,
      subtitle: wealth.investments.count ? `${t.returnLabel} ${formatPercent(wealth.investments.percent)}` : fh.investmentsDetail,
      meta: formatMoney(wealth.investments.value, currency)
    },
    {
      href: "/cards",
      icon: "credit-card",
      title: t.cards,
      subtitle: fh.cardsDetail,
      meta: String(data.cards.length),
      badge: expiring ? { tone: "accent", glyph: "△", text: fh.cardsExpiring(expiring) } : undefined
    },
    {
      href: "/obligations",
      icon: "calendar",
      title: t.obligations,
      subtitle: wealth.owed ? t.owed : fh.obligationsDetail,
      meta: formatMoney(wealth.owed, currency),
      badge: lateInstallments ? { tone: "urgent", glyph: "!", text: fh.overdue(lateInstallments) } : undefined
    }
  ];

  const left = (
    <>
      <Card title={fh.thisMonth}>
        <StatGrid columns={2}>
          {[
            <StatTile key="month" label={fh.spentMonth} value={formatMoney(finance.monthSpend, currency)} size={18} />,
            <StatTile key="today" label={fh.spentToday} value={formatMoney(finance.todaySpend, currency)} size={18} />,
            <StatTile key="bills" label={fh.bills} value={formatMoney(finance.monthlyCommitments, currency)} alert={finance.overdueBills.length > 0} size={18} />,
            <StatTile key="net" label={fh.netWorth} value={formatMoney(wealth.net, currency)} size={18} />
          ]}
        </StatGrid>
        {budget ? (
          <GoalBar
            label={fh.budgetUsed}
            value={formatMoney(budget.spent, currency)}
            goal={formatMoney(budget.limit, currency)}
            percent={Math.min(100, (budget.spent / budget.limit) * 100)}
            color={budget.state === "over" ? colors.dangerOnShell : budget.state === "near" ? colors.accentDeep : undefined}
          />
        ) : null}
      </Card>

      {/* Bank messages wait for a decision, so they stay open; the card hides itself when there is nothing. */}
      <BankReviewCard items={review.items} failed={review.failed} confirm={review.confirm} ignore={review.ignore} />

      <Card title={fh.inFinance}>
        {parts.map((part, index) => (
          <ListRow
            key={String(part.href)}
            first={index === 0}
            href={part.href}
            leading={<IconTile name={part.icon} />}
            title={part.title}
            subtitle={part.subtitle}
            badges={part.badge ? <Badge tone={part.badge.tone} glyph={part.badge.glyph}>{part.badge.text}</Badge> : undefined}
            meta={part.meta}
          />
        ))}
      </Card>
    </>
  );

  const right = (
    <>
      <Card
        title={fh.billsAndSubs}
        action={finance.overdueBills.length ? <Badge tone="urgent" glyph="!">{fh.overdue(finance.overdueBills.length)}</Badge> : undefined}
        fold={{ open: billsOpen, onToggle: () => toggle("bills", billsNeedYou), summary: billsOpen ? undefined : fh.due(bills.length) }}
      >
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
        <SubHead title={t.subscriptions} value={`${t.monthlyTotal} ${formatMoney(subscriptionMonthlyTotal(data.bills), currency)}`} />
        {subscriptions.length ? (
          subscriptions.map((bill) => (
            <ListRow
              key={bill.id}
              title={bill.name}
              subtitle={`${t.renews} ${day(bill.due_at)} · ${cardName(bill) ?? t.noCard}`}
              meta={formatMoney(bill.amount, bill.currency)}
              // Tap to pick the card it is charged to.
              onPress={() => pickCard(bill)}
            />
          ))
        ) : (
          <EmptyState example="subscription netflix 45">{t.emptyEx}</EmptyState>
        )}
      </Card>

      <BudgetCard
        budgets={data.budgets}
        expenses={data.expenses}
        currency={currency}
        refresh={refresh}
        fold={{ open: budgetOpen, onToggle: () => toggle("budget", budgetNeedsYou), summary: budgetOpen || !budget ? undefined : `${formatMoney(budget.spent, currency)} / ${formatMoney(budget.limit, currency)}` }}
      />

      <Card title={fh.expenses} fold={{ open: expensesOpen, onToggle: () => toggle("expenses", false), summary: expensesOpen ? undefined : formatMoney(finance.monthSpend, currency) }}>
        <SubHead title={t.byCategory} />
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
        {data.expenses.length ? <SubHead title={t.recentExpenses} /> : null}
        {data.expenses.slice(0, 10).map((expense) => (
          <ListRow key={expense.id} title={expense.merchant} subtitle={`${formatDate(expense.spent_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${t.financeCategoryNames[expense.category]}`} meta={`−${formatMoney(expense.amount, expense.currency)}`} />
        ))}
      </Card>
    </>
  );

  return (
    <Screen wide refreshing={loading} onRefresh={() => Promise.all([refresh(), review.load()])}>
      <Columns left={left} right={right} />
    </Screen>
  );
}

/** A smaller heading inside an open section. */
function SubHead({ title, value }: { title: string; value?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10 }}>
      <Text style={[type.tileLabel, { flex: 1 }]}>{title}</Text>
      {value ? <Text style={type.rowSubtitle}>{value}</Text> : null}
    </View>
  );
}
