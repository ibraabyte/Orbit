import { QuickAddCard } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section, Stats } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { foodSummary, mealTypeLabel } from "@/lib/food";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";

export default function Food() {
  const { data, loading, refresh, act } = useDashboardData();
  const food = foodSummary(data);
  const plans = [...food.overdueMealPlans, ...food.upcomingMealPlans];

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "plan dinner salmon @friday" or "grocery milk".' />
      <Stats
        items={[
          ["Meals today", food.todayPlannedMeals, "coffee"],
          ["Planned kcal", food.todayPlannedCalories, "zap"],
          ["Groceries", food.neededGroceries.length, "shopping-bag"]
        ]}
      />
      <Section title="Meal plans">
        {plans.length ? plans.map((plan) => <Row key={plan.id} title={plan.name} detail={`${plan.plan_date} · ${mealTypeLabel(plan.meal_type)}`} right={`${plan.calories} kcal`} tone={food.overdueMealPlans.includes(plan) ? "warning" : undefined} />) : <Empty>Plan one: "plan dinner salmon @friday".</Empty>}
      </Section>
      {food.grocerySections.length ? (
        food.grocerySections.map((section) => (
          <Section key={section.category} title={section.category}>
            {section.items.map(({ item, mealPlan }) => (
              <Row
                key={item.id}
                title={item.name}
                detail={[item.quantity, mealPlan?.name].filter(Boolean).join(" · ") || null}
                right="Bought"
                onPress={() => act(() => apiUpdate(getApi(), "/grocery-items", item.id, { status: "bought" }))}
              />
            ))}
          </Section>
        ))
      ) : (
        <Section title="Groceries">
          <Empty>Nothing to buy. Add: "grocery milk".</Empty>
        </Section>
      )}
    </Screen>
  );
}
