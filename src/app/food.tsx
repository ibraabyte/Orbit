import { Badge, Card, EmptyState, ListRow, RowButton, StatGrid, StatTile } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { foodSummary, mealTypeLabel } from "@/lib/food";
import { formatDate, t } from "@/lib/i18n";

export default function Food() {
  const { data, loading, refresh, act } = useDashboardData();
  const { toast } = useOverlays();
  const food = foodSummary(data);
  const plans = [...food.overdueMealPlans, ...food.upcomingMealPlans];

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <StatGrid columns={3}>
        {[
          <StatTile key="meals" label={t.mealsToday} value={food.todayPlannedMeals} />,
          <StatTile key="kcal" label={t.plannedCal} value={food.todayPlannedCalories} />,
          <StatTile key="groceries" label={t.groceriesNeeded} value={food.neededGroceries.length} color={colors.accentDeep} />
        ]}
      </StatGrid>
      <Card title={t.mealPlans}>
        {plans.length ? (
          plans.map((plan) => {
            const day = `${plan.plan_date}T12:00:00`;
            return (
              <ListRow
                key={plan.id}
                title={plan.name}
                badges={food.overdueMealPlans.includes(plan) ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : isToday(day) ? <Badge tone="accent" glyph="◷">{t.dueToday}</Badge> : <Badge glyph="○">{t.upcoming}</Badge>}
                subtitle={`${formatDate(day, { weekday: "short", day: "numeric", month: "short" })} · ${mealTypeLabel(plan.meal_type)}`}
                meta={`${plan.calories} ${t.kcal}`}
              />
            );
          })
        ) : (
          <EmptyState example="plan dinner salmon @friday">{t.emptyEx}</EmptyState>
        )}
      </Card>
      {food.grocerySections.length ? (
        food.grocerySections.map((section) => (
          <Card key={section.category} title={section.category}>
            {section.items.map(({ item, mealPlan }) => (
              <ListRow
                key={item.id}
                title={item.name}
                titleExtra={item.quantity ?? undefined}
                subtitle={mealPlan ? `${t.forMeal} ${mealPlan.name}` : null}
                trailing={<RowButton outline label={t.bought} onPress={() => act(() => apiUpdate(getApi(), "/grocery-items", item.id, { status: "bought" })).then(() => toast(t.bought))} />}
              />
            ))}
          </Card>
        ))
      ) : (
        <Card title={t.groceries}>
          <EmptyState example="buy milk">{t.emptyEx}</EmptyState>
        </Card>
      )}
    </Screen>
  );
}
