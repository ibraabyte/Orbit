import { IconTile, ListRow } from "@/components/drift";
import { QuickAddCard } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section, Stats } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildHealthSnapshot } from "@/lib/health";
import { formatSleepDuration } from "@/lib/sleep";

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
  const target = (value: number | null) => (value ? `/${value}` : "");

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "meal 650 chicken rice", "workout 40m run" or "sleep 7h".' />
      <ListRow leading={<IconTile name="watch" />} title="WHOOP" subtitle="Recovery, sleep and strain from your band" href="/whoop" chevron />
      <Stats
        items={[
          ["Calories", `${health.todayCalories}${target(health.calorieTarget)}`, "coffee"],
          ["Protein g", `${Math.round(health.todayMacros.protein)}${target(health.macroTargets.protein)}`, "pie-chart"],
          ["Carbs g", `${Math.round(health.todayMacros.carbs)}${target(health.macroTargets.carbs)}`, "pie-chart"],
          ["Fat g", `${Math.round(health.todayMacros.fat)}${target(health.macroTargets.fat)}`, "pie-chart"],
          ["Workout 7d", `${health.workoutMinutes}/${health.workoutTarget}m`, "activity"],
          ["Sleep avg", formatSleepDuration(health.sleepAverageMinutes), "moon"],
          ["Weight", health.latestWeight === null ? "-" : `${health.latestWeight} ${health.weightUnit}`, "trending-down"],
          ["Change", health.weightDelta === null ? "-" : `${health.weightDelta > 0 ? "+" : ""}${health.weightDelta}`, "bar-chart"]
        ]}
      />
      <Section title="Meals">
        {data.meals.length ? data.meals.slice(0, 8).map((meal) => <Row key={meal.id} title={meal.name} detail={new Date(meal.logged_at).toLocaleString()} right={`${meal.calories} kcal`} />) : <Empty>Log one: "meal 650 chicken rice".</Empty>}
      </Section>
      <Section title="Workouts">
        {data.workouts.length ? data.workouts.slice(0, 6).map((workout) => <Row key={workout.id} title={workout.type} detail={new Date(workout.logged_at).toLocaleDateString()} right={`${workout.duration_minutes ?? 0}m`} />) : <Empty>Log one: "workout 40m run".</Empty>}
      </Section>
      <Section title="Sleep">
        {data.sleepLogs.length ? data.sleepLogs.slice(0, 7).map((log) => <Row key={log.id} title={log.sleep_date} right={formatSleepDuration(log.duration_minutes)} detail={log.quality ? `Quality ${log.quality}/5` : null} />) : <Empty>Log one: "sleep 7h".</Empty>}
      </Section>
    </Screen>
  );
}
