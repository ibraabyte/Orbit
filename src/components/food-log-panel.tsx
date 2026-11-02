import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, Icon, type } from "@/components/drift";
import { Button, Segments } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { formatNumber, macroText, mealTypeAt, scaleNutrition, servingText, sourceLabel, stepServings, type FoodCandidate, type MealType } from "@/lib/food-log";
import { t } from "@/lib/i18n";

const pickerTypes = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly MealType[];

/** One food picked from search, a barcode or the user's list: choose servings and meal, then log. */
export function FoodLogPanel({ food, busy, onLog, onClose }: { food: FoodCandidate; busy?: boolean; onLog: (servings: number, mealType: MealType) => void; onClose?: () => void }) {
  const [servings, setServings] = useState(1);
  const [mealType, setMealType] = useState<(typeof pickerTypes)[number]>(() => {
    const guess = mealTypeAt();
    return guess === "other" ? "snack" : guess;
  });
  const total = scaleNutrition(food, servings);
  const macros = macroText(total);

  return (
    <Card
      title={food.name}
      action={
        onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t.cancel} hitSlop={10}>
            <Icon name="x" size={18} color={colors.inkMuted} />
          </Pressable>
        ) : undefined
      }
    >
      <View style={styles.meta}>
        <Badge>{food.source === "custom" ? t.mine : sourceLabel(food.source)}</Badge>
        <Text style={type.rowSubtitle}>{[food.brand, servingText(food), `${formatNumber(food.calories)} ${t.kcal}`].filter(Boolean).join(" · ")}</Text>
      </View>

      <View style={styles.stepper}>
        <Text style={[type.barLabel, { flex: 1 }]}>{t.servings}</Text>
        <Pressable onPress={() => setServings((value) => stepServings(value, -1))} accessibilityRole="button" accessibilityLabel={`${t.servings} -`} style={styles.stepButton}>
          <Icon name="minus" size={16} color={colors.ink} />
        </Pressable>
        <Text style={styles.servings} accessibilityLiveRegion="polite">
          {formatNumber(servings)}
        </Text>
        <Pressable onPress={() => setServings((value) => stepServings(value, 1))} accessibilityRole="button" accessibilityLabel={`${t.servings} +`} style={styles.stepButton}>
          <Icon name="plus" size={16} color={colors.ink} />
        </Pressable>
      </View>

      <Segments options={pickerTypes} value={mealType} onChange={setMealType} labels={t.mealTypeNames} />

      <View style={styles.total}>
        <Text style={type.stat}>
          {total.calories} <Text style={type.rowSubtitle}>{t.kcal}</Text>
        </Text>
        {macros ? <Text style={type.rowSubtitle}>{macros}</Text> : null}
      </View>
      <Button title={t.logIt} variant="primary" disabled={busy} onPress={() => onLog(servings, mealType)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  servings: { minWidth: 44, textAlign: "center", fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingVertical: 4, borderRadius: radius.tile }
});
