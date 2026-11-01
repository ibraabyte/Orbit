import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Chevron, EmptyState, GoalBar, ListRow, StatGrid, StatTile, type } from "@/components/drift";
import { Screen } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildHealthSnapshot } from "@/lib/health";
import { formatDate, t } from "@/lib/i18n";
import { formatSleepDuration } from "@/lib/sleep";

const stamp = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

// Health = actuals vs targets, and the logs.
export default function Health() {
  const { data, loading, refresh } = useDashboardData();
  const profile = data.profile;
  const health = buildHealthSnapshot(data, {
    dailyCalorieTarget: profile?.daily_calorie_target ?? null,
    dailyProteinTarget: profile?.daily_protein_target ?? null,
    dailyCarbsTarget: profile?.daily_carbs_target ?? null,
    dailyFatTarget: profile?.daily_fat_target ?? null,
    weeklyWorkoutTarget: profile?.weekly_workout_minutes_target ?? 150
  });
  const macro = (label: string, value: number, goal: number | null, color?: string) => <GoalBar key={label} label={label} value={String(Math.round(value))} goal={goal ? String(goal) : null} percent={goal ? (value / goal) * 100 : 0} color={color} />;

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Card style={{ gap: 12, paddingVertical: 14 }}>
        {macro(t.calories, health.todayCalories, health.calorieTarget)}
        {macro(t.protein, health.todayMacros.protein, health.macroTargets.protein, colors.sage)}
        {macro(t.carbs, health.todayMacros.carbs, health.macroTargets.carbs, colors.sage)}
        {macro(t.fat, health.todayMacros.fat, health.macroTargets.fat, colors.sage)}
      </Card>

      <StatGrid columns={3}>
        {[
          <StatTile key="workouts" label={t.workouts7} value={health.workoutMinutes} unit={`/ ${health.workoutTarget}`} size={18} />,
          <StatTile key="sleep" label={t.avgSleep} value={formatSleepDuration(health.sleepAverageMinutes)} size={18} />,
          <StatTile key="weight" label={t.weight} value={health.latestWeight ?? "–"} unit={health.weightDelta ? `${health.weightDelta < 0 ? "↓" : "↑"}${Math.abs(health.weightDelta)}` : undefined} size={18} />
        ]}
      </StatGrid>

      <Link href="/whoop" asChild>
        <Pressable accessibilityRole="link" style={styles.whoop}>
          <View style={styles.whoopMark}>
            <Text style={styles.whoopGlyph}>W</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.title, { fontSize: 14, color: colors.urgentInk }]}>WHOOP</Text>
            <Text style={[type.rowSubtitle, { color: colors.onShellMuted }]}>
              {t.recovery} · {t.sleep} · {t.strain}
            </Text>
          </View>
          <Chevron color={colors.accent} size={20} />
        </Pressable>
      </Link>

      <Card title={t.meals}>
        {data.meals.length ? data.meals.slice(0, 8).map((meal) => <ListRow key={meal.id} title={meal.name} subtitle={stamp(meal.logged_at)} meta={`${meal.calories} ${t.kcal}`} />) : <EmptyState example="meal 650 chicken rice">{t.emptyEx}</EmptyState>}
      </Card>
      <Card title={t.workouts}>
        {data.workouts.length ? (
          data.workouts.slice(0, 6).map((workout) => (
            <ListRow
              key={workout.id}
              leading={
                <View style={styles.minutes}>
                  <Text style={[type.barValue, { fontSize: 12, color: colors.accentTintInk }]}>{workout.duration_minutes ?? 0}′</Text>
                </View>
              }
              title={workout.type}
              subtitle={stamp(workout.logged_at)}
            />
          ))
        ) : (
          <EmptyState example="workout 40m run">{t.emptyEx}</EmptyState>
        )}
      </Card>
      <Card title={t.sleep}>
        {data.sleepLogs.length ? (
          data.sleepLogs.slice(0, 7).map((log) => (
            <ListRow
              key={log.id}
              title={formatSleepDuration(log.duration_minutes)}
              subtitle={stamp(`${log.sleep_date}T12:00:00`)}
              trailing={
                log.quality ? (
                  <Text style={[type.tileLabel, { fontSize: 12 }]} accessibilityLabel={`${t.quality} ${log.quality}/5`}>
                    {t.quality} <Text style={{ color: colors.accentDeep }}>{"★".repeat(log.quality)}</Text>
                    <Text style={{ color: colors.hairline }}>{"★".repeat(5 - log.quality)}</Text>
                  </Text>
                ) : undefined
              }
            />
          ))
        ) : (
          <EmptyState example="slept 7h q4">{t.emptyEx}</EmptyState>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  whoop: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, backgroundColor: colors.urgent, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12 },
  whoopMark: { width: 36, height: 36, borderRadius: radius.tile, backgroundColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  whoopGlyph: { fontFamily: fonts.bold, fontSize: 12, color: colors.urgentInk },
  minutes: { width: 36, height: 36, borderRadius: radius.control, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" }
});
