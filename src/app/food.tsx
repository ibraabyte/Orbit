import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, MoreButton, ProgressBar, RingGauge, RowButton, type, type IconName } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { GroupHeader, Screen } from "@/components/screen";
import { colors, fonts, lineHeights, radius, space, textSize } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi, hasServer } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { foodSummary, mealTypeLabel } from "@/lib/food";
import { foodApi, formatNumber, macroText, mealsByType, targetPercent, type FoodDay, type MealType } from "@/lib/food-log";
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

  const macros = day
    ? [
        { label: t.protein, value: day.totals.protein_g, goal: day.targets.protein_g },
        { label: t.carbs, value: day.totals.carbs_g, goal: day.targets.carbs_g },
        { label: t.fat, value: day.totals.fat_g, goal: day.targets.fat_g }
      ]
    : [];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {/* Today in one ring: eaten against the goal, what's left, then the three macros side by side. */}
      <Card style={styles.hero}>
        <RingGauge value={targetPercent(eaten, target) / 100} size={148} thickness={12} label={formatNumber(eaten)} sublabel={target ? `/ ${formatNumber(target)} ${t.kcal}` : t.kcal} />
        {target ? (
          <Text style={styles.left}>{eaten <= target ? `${formatNumber(target - eaten)} ${t.kcal} ${t.left}` : `${formatNumber(eaten - target)} ${t.kcal} ${t.over}`}</Text>
        ) : (
          <Pressable onPress={() => router.push("/health-goals")} accessibilityRole="link" hitSlop={8}>
            <Text style={[type.link, { color: colors.link }]}>{t.noTarget}</Text>
          </Pressable>
        )}
        {macros.length ? (
          <View style={styles.macros}>
            {macros.map((macro) => (
              <View key={macro.label} style={{ flex: 1, gap: space.xs }}>
                <Text style={type.rowSubtitle} numberOfLines={1}>
                  {macro.label}
                </Text>
                <ProgressBar value={targetPercent(macro.value, macro.goal)} />
                <Text style={type.tileLabel} numberOfLines={1}>
                  {`${formatNumber(macro.value)}${macro.goal ? ` / ${formatNumber(macro.goal)}` : ""} g`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
      <View style={styles.actions}>
        {addActions.map((action) => (
          <Pressable key={action.label} onPress={() => router.push(action.href)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
            <IconTile name={action.icon} size={36} />
            <Text style={styles.actionText} numberOfLines={2}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View>
        <GroupHeader label={t.mealsToday} />
        <Card list>
          {dayError ? <ListRow first title={dayError} /> : null}
          {day && !day.meals.length ? <ListRow first leading={<IconTile name="plus" size={36} />} title={t.nothingEaten} onPress={() => router.push("/food-add")} /> : null}
          {day
            ? mealsByType(day.meals).flatMap((group, groupIndex) =>
                group.meals.map((meal, index) => (
                  <ListRow
                    key={meal.id}
                    first={groupIndex === 0 && index === 0}
                    leading={<IconTile name={mealIcons[group.type]} size={36} />}
                    title={meal.name}
                    subtitle={[t.mealTypeNames[group.type], meal.servings && meal.servings !== 1 ? `× ${formatNumber(meal.servings)}` : null, macroText(meal)].filter(Boolean).join(" · ")}
                    meta={`${meal.calories}`}
                    trailing={<MoreButton label={meal.name} onPress={() => mealOptions(meal.id, meal.name)} />}
                  />
                ))
              )
            : null}
        </Card>
      </View>

      <View>
        <GroupHeader label={t.mealPlans} />
        <Card list={plans.length > 0}>
          {plans.length ? (
            plans.map((plan, index) => {
              const day = `${plan.plan_date}T12:00:00`;
              return (
                <ListRow
                  key={plan.id}
                  first={index === 0}
                  title={plan.name}
                  subtitle={`${formatDate(day, { weekday: "short", day: "numeric", month: "short" })} · ${mealTypeLabel(plan.meal_type)} · ${plan.calories} ${t.kcal}`}
                  trailing={food.overdueMealPlans.includes(plan) ? <Badge tone="urgent" glyph="!">{t.overdue}</Badge> : isToday(day) ? <Badge tone="urgent" glyph="◷">{t.dueToday}</Badge> : <Badge glyph="○">{t.upcoming}</Badge>}
                />
              );
            })
          ) : (
            <EmptyState example="plan dinner salmon @friday">{t.emptyEx}</EmptyState>
          )}
        </Card>
      </View>

      {food.grocerySections.length ? (
        food.grocerySections.map((section) => (
          <View key={section.category}>
            <GroupHeader label={`${section.category} · ${formatNumber(section.items.length)}`} />
            <Card list>
              {section.items.map(({ item, mealPlan }, index) => (
                <ListRow
                  key={item.id}
                  first={index === 0}
                  title={item.name}
                  titleExtra={item.quantity ?? undefined}
                  subtitle={mealPlan ? `${t.forMeal} ${mealPlan.name}` : null}
                  trailing={<RowButton outline label={t.bought} onPress={() => act(() => apiUpdate(getApi(), "/grocery-items", item.id, { status: "bought" })).then(() => toast(t.bought))} />}
                />
              ))}
            </Card>
          </View>
        ))
      ) : (
        <View>
          <GroupHeader label={t.groceries} />
          <Card>
            <EmptyState example="buy milk">{t.emptyEx}</EmptyState>
          </Card>
        </View>
      )}
    </Screen>
  );
}

const mealIcons: Record<MealType, IconName> = { breakfast: "sun", lunch: "coffee", dinner: "moon", snack: "package", other: "circle" };

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.lg, paddingVertical: space.xl },
  left: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, color: colors.link },
  macros: { flexDirection: "row", gap: space.md, alignSelf: "stretch" },
  actions: { flexDirection: "row", gap: space.sm },
  action: { flex: 1, minHeight: 88, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: space.sm },
  actionText: { fontFamily: fonts.semibold, fontSize: textSize.caption2, lineHeight: lineHeights.caption2, color: colors.ink, textAlign: "center" }
});
