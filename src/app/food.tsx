import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, GoalBar, Icon, ListRow, MoreButton, RingGauge, RowButton, StatGrid, StatTile, type, type IconName } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Screen } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi, hasServer } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { foodSummary, mealTypeLabel } from "@/lib/food";
import { foodApi, formatNumber, macroText, mealsByType, targetPercent, type FoodDay } from "@/lib/food-log";
import { formatDate, t } from "@/lib/i18n";

const addActions: { label: string; icon: IconName; href: Href }[] = [
  { label: t.addFood, icon: "search", href: "/food-add" },
  { label: t.scanBarcode, icon: "maximize", href: "/food-scan" },
  { label: t.platePhoto, icon: "camera", href: "/food-photo" },
  { label: t.myFood, icon: "edit-3", href: { pathname: "/food-add", params: { mode: "new" } } }
];

export default function Food() {
  const { data, loading, refresh, act } = useDashboardData();
  const { toast, sheet } = useOverlays();
  const food = foodSummary(data);
  const plans = [...food.overdueMealPlans, ...food.upcomingMealPlans];
  const [day, setDay] = useState<FoodDay | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);

  const loadDay = useCallback(async () => {
    if (!hasServer()) return;
    try {
      setDay(await foodApi.day(getApi()));
      setDayError(null);
    } catch (error) {
      setDayError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  // Coming back from search, scan or photo shows what was just logged.
  useFocusEffect(
    useCallback(() => {
      void loadDay();
    }, [loadDay])
  );

  const reload = () => {
    refresh();
    void loadDay();
  };

  const mealOptions = (mealId: string, name: string) =>
    sheet({
      title: name,
      options: [
        {
          label: t.deleteMeal,
          destructive: true,
          run: () =>
            void foodApi
              .deleteMeal(getApi(), mealId)
              .then(loadDay)
              .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error)))
        }
      ]
    });

  const target = day?.targets.calories ?? null;
  const eaten = day?.totals.calories ?? 0;

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Card title={t.foodLog}>
        <View style={styles.summary}>
          <RingGauge value={targetPercent(eaten, target) / 100} size={76} label={String(eaten)} sublabel={t.kcal} />
          <View style={{ flex: 1, gap: 6 }}>
            {target ? (
              <Text style={type.body}>
                {eaten <= target ? `${target - eaten} ${t.kcal} ${t.left}` : `${eaten - target} ${t.kcal} ${t.over}`}
              </Text>
            ) : (
              <Pressable onPress={() => router.push("/health-goals")} accessibilityRole="link" hitSlop={8}>
                <Text style={[type.link, { color: colors.accent }]}>{t.noTarget}</Text>
              </Pressable>
            )}
            {day ? (
              <>
                <GoalBar label={t.protein} value={`${formatNumber(day.totals.protein_g)} g`} goal={day.targets.protein_g ? `${day.targets.protein_g} g` : null} percent={targetPercent(day.totals.protein_g, day.targets.protein_g)} />
                <Text style={type.rowSubtitle}>{macroText(day.totals)}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.actions}>
          {addActions.map((action) => (
            <Pressable key={action.label} onPress={() => router.push(action.href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
              <Icon name={action.icon} size={18} color={colors.ink} />
              <Text style={styles.actionText} numberOfLines={2}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {dayError ? <Text style={type.rowSubtitle}>{dayError}</Text> : null}
        {day && !day.meals.length ? <Text style={type.rowSubtitle}>{t.nothingEaten}</Text> : null}
        {day
          ? mealsByType(day.meals).map((group) => (
              <View key={group.type}>
                <Text style={[type.tileLabel, { marginTop: 8 }]}>{`${t.mealTypeNames[group.type]} · ${group.calories} ${t.kcal}`}</Text>
                {group.meals.map((meal) => (
                  <ListRow
                    key={meal.id}
                    title={meal.name}
                    subtitle={[meal.servings && meal.servings !== 1 ? `× ${formatNumber(meal.servings)}` : null, macroText(meal)].filter(Boolean).join(" · ") || null}
                    meta={`${meal.calories} ${t.kcal}`}
                    trailing={<MoreButton label={meal.name} onPress={() => mealOptions(meal.id, meal.name)} />}
                  />
                ))}
              </View>
            ))
          : null}
      </Card>
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

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: 14 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, minHeight: 64, paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.tile, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, color: colors.ink, textAlign: "center" }
});
