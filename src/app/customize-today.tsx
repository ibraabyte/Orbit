import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Card, Icon, ListRow, type } from "@/components/drift";
import { colors, fonts, radius, space, textSize } from "@/components/theme";
import { useSections } from "@/hooks/use-sections";
import { useTodayLayout } from "@/hooks/use-today-layout";
import { dp } from "@/lib/day-plan";
import { t } from "@/lib/i18n";
import { rx } from "@/lib/medications";
import { pt } from "@/lib/plan";
import type { TodayCard } from "@/lib/today-layout";

const labels: Record<TodayCard, string> = {
  brief: t.morningBrief,
  dayplan: dp.short,
  digest: t.digest,
  attention: t.attention,
  upnext: t.nextUp,
  meds: rx.todayDoses,
  workout: pt.todayWorkout,
  week: t.weekSummary,
  quick: t.quick,
  health: t.healthToday
};

// Today → Customize, as a sheet: every card below the prayer with a switch to show or hide it, and arrows to move it
// up or down. Changes show on Today at once. Cards of a section switched off in Settings are left out.
// ponytail: arrows, not drag; add drag-to-reorder if the list grows long enough to need it.
export default function CustomizeToday() {
  const { layout, shown, setShown, move } = useTodayLayout();
  const { on } = useSections();
  const inUse = (card: TodayCard) => (card === "health" ? on("health") : card === "workout" ? on("exercises") : card === "meds" ? on("medications") : true);
  const cards = layout.order.filter(inUse);
  const track = { true: colors.accent, false: colors.hairline };

  const arrow = (card: TodayCard, by: -1 | 1, disabled: boolean) => (
    <Pressable
      onPress={() => move(card, by)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${by < 0 ? t.moveUp : t.moveDown}: ${labels[card]}`}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, disabled && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
    >
      <Icon name={by < 0 ? "chevron-up" : "chevron-down"} size={16} color={colors.ink} />
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={[styles.title, { flex: 1 }]}>{t.customize}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <Text style={[type.pill, { fontSize: textSize.subheadline, color: colors.link }]}>{t.done}</Text>
        </Pressable>
      </View>
      <Card list>
        {cards.map((card, index) => (
          <ListRow
            key={card}
            first={index === 0}
            title={labels[card]}
            trailing={
              <View style={styles.controls}>
                {arrow(card, -1, index === 0)}
                {arrow(card, 1, index === cards.length - 1)}
                <Switch accessibilityLabel={labels[card]} trackColor={track} value={shown(card)} onValueChange={(next) => setShown(card, next)} />
              </View>
            }
          />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.xl, gap: space.md },
  header: { flexDirection: "row", alignItems: "center", gap: space.lg },
  title: { fontFamily: fonts.bold, fontSize: textSize.title3, color: colors.onShell },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm },
  arrow: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" }
});
