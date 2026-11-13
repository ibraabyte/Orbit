import { useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Card, CardLink, EmptyState, GoalBar, IconTile, ListRow, StatGrid, StatTile, type, type IconName } from "@/components/drift";
import { Columns, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { pathHidden } from "@/lib/app-sections";
import { getApi, hasServer } from "@/lib/backend";
import { et, exercisesApi } from "@/lib/exercises";
import { foodApi, targetPercent, type FoodDay } from "@/lib/food-log";
import { buildHealthSnapshot } from "@/lib/health";
import { deltaText, goalFields, ht, weightHistory, whoopWeekMinutes } from "@/lib/health-hub";
import { formatDate, t } from "@/lib/i18n";
import { formatSleepDuration } from "@/lib/sleep";
import { trainingApi, tt } from "@/lib/training";
import { formatHours, whoopApi, type WhoopStatus, type WhoopSummary } from "@/lib/whoop";

const stamp = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

type Live = { day: FoodDay | null; whoop: WhoopStatus | null; summary: WhoopSummary | null; injuries: number | null; active: boolean };

// Health is the one door: today's numbers, then Food, Exercises and WHOOP under it, your body, your goals,
// and what you logged by hand. Each part keeps its own screen; this one gathers them.
export default function Health() {
  const { data, loading, refresh } = useDashboardData();
  // Food, exercises and WHOOP can each be switched off in Settings → Sections; they leave this hub too.
  const { on, hidden } = useSections();
  const foodOn = on("food");
  const [live, setLive] = useState<Live>({ day: null, whoop: null, summary: null, injuries: null, active: false });

  const loadLive = useCallback(async () => {
    if (!hasServer()) return;
    const api = getApi();
    // Each part loads on its own: WHOOP being off or down must not hide today's food.
    const [day, whoop, injuries, active] = await Promise.allSettled([foodApi.day(api), whoopApi.status(api), exercisesApi.injuries(api), trainingApi.active(api)]);
    const status = whoop.status === "fulfilled" ? whoop.value : null;
    let summary: WhoopSummary | null = null;
    if (status?.connected) summary = await whoopApi.summary(api, 14).catch(() => null);
    setLive({
      day: day.status === "fulfilled" ? day.value : null,
      whoop: status,
      summary,
      injuries: injuries.status === "fulfilled" ? injuries.value.filter((injury) => injury.active).length : null,
      active: active.status === "fulfilled" && active.value !== null
    });
  }, []);

  // Coming back from Food, WHOOP or the goals shows the new numbers.
  useFocusEffect(
    useCallback(() => {
      void loadLive();
    }, [loadLive])
  );

  const reload = () => {
    void refresh();
    void loadLive();
  };

  const profile = data.profile;
  const health = buildHealthSnapshot(data, {
    dailyCalorieTarget: profile?.daily_calorie_target ?? null,
    dailyProteinTarget: profile?.daily_protein_target ?? null,
    weeklyWorkoutTarget: profile?.weekly_workout_minutes_target ?? 150
  });

  const { day, whoop, summary } = live;
  const whoopOn = on("whoop") && Boolean(whoop?.connected && summary?.has_data);
  const eaten = day?.totals.calories ?? health.todayCalories;
  const calorieTarget = day?.targets.calories ?? health.calorieTarget;
  const protein = day?.totals.protein_g ?? health.todayMacros.protein;
  const proteinTarget = day?.targets.protein_g ?? health.macroTargets.protein;
  const recovery = summary?.latest.recovery?.value ?? null;
  const workoutMinutes = whoopOn && summary ? Math.max(whoopWeekMinutes(summary.daily), health.workoutMinutes) : health.workoutMinutes;
  const sleepText = whoopOn && summary?.latest.sleep_hours ? formatHours(summary.latest.sleep_hours.value) : health.sleepNights ? formatSleepDuration(health.sleepAverageMinutes) : "–";

  const allSections: { href: Href; icon: IconName; title: string; subtitle: string; meta?: string }[] = [
    { href: "/food", icon: "coffee", title: t.food, subtitle: ht.foodDetail, meta: eaten ? `${eaten} ${t.kcal}` : undefined },
    { href: "/training", icon: "bar-chart-2", title: tt.workouts, subtitle: tt.workoutsDetail, meta: live.active ? tt.inProgress : undefined },
    { href: "/exercises", icon: "zap", title: et.exercises, subtitle: ht.exercisesDetail },
    { href: "/gym", icon: "home", title: et.gym, subtitle: ht.gymDetail },
    { href: "/injuries", icon: "alert-circle", title: et.injuries, subtitle: ht.injuriesDetail, meta: live.injuries ? ht.activeInjuries(live.injuries) : undefined },
    { href: "/body", icon: "maximize", title: tt.measurements, subtitle: tt.measurementsDetail },
    { href: "/whoop", icon: "watch", title: t.whoop, subtitle: ht.whoopDetail, meta: whoop?.connected ? (recovery === null ? undefined : `${Math.round(recovery)}%`) : whoop?.configured ? ht.whoopConnect : undefined }
  ];
  const sections = allSections.filter((section) => !pathHidden(String(section.href), hidden));

  const weights = weightHistory(data.weightLogs);
  const manualSleep = data.sleepLogs.slice(0, 3);
  const manualWorkouts = data.workouts.slice(0, 3);
  const goalValue = (value: number | null | undefined) => (value === null || value === undefined ? ht.notSet : String(value));

  const left = (
    <>
      <Card title={ht.todayLabel}>
        <StatGrid columns={2}>
          {[
            ...(foodOn ? [<StatTile key="eaten" href="/food" label={ht.eaten} value={eaten} unit={calorieTarget ? `/ ${calorieTarget} ${t.kcal}` : t.kcal} size={18} />] : []),
            ...(whoopOn ? [<StatTile key="recovery" href="/whoop" label={ht.readiness} value={recovery === null ? "–" : `${Math.round(recovery)}%`} size={18} />] : []),
            // Weight fills the place of whichever of the two is missing.
            ...(!foodOn || !whoopOn ? [<StatTile key="weight" label={t.weight} value={health.latestWeight ?? "–"} unit={deltaText(health.weightDelta) ?? health.weightUnit ?? undefined} size={18} />] : []),
            <StatTile key="sleep" href={whoopOn ? "/whoop" : undefined} label={whoopOn ? ht.sleepLast : t.avgSleep} value={sleepText} size={18} />,
            <StatTile key="workouts" label={ht.workoutsWeek} value={workoutMinutes} unit={`/ ${health.workoutTarget} ${t.min}`} size={18} />
          ]}
        </StatGrid>
        {foodOn && proteinTarget ? <GoalBar label={t.protein} value={`${Math.round(protein)} g`} goal={`${proteinTarget} g`} percent={targetPercent(protein, proteinTarget)} /> : null}
      </Card>

      {sections.length ? (
      <Card title={ht.inHealth}>
        {sections.map((section, index) => (
          <ListRow key={String(section.href)} first={index === 0} href={section.href} leading={<IconTile name={section.icon} />} title={section.title} subtitle={section.subtitle} meta={section.meta} />
        ))}
      </Card>
      ) : null}
    </>
  );

  const right = (
    <>
      <Card title={ht.body} action={on("exercises") ? <CardLink href="/body" label={tt.measurements} /> : undefined}>
        {weights.length ? (
          weights.map(({ log, delta }) => <ListRow key={log.id} title={`${log.weight} ${log.unit}`} subtitle={stamp(log.logged_at)} meta={deltaText(delta) ?? undefined} />)
        ) : (
          <EmptyState icon="trending-down" example={ht.weightExample}>{ht.noWeight}</EmptyState>
        )}
      </Card>

      <Card title={ht.goals} action={<CardLink href="/health-goals" label={ht.editGoals} />}>
        {goalFields.map((field) => (
          <ListRow key={field.key} title={field.label} meta={goalValue(profile?.[field.key])} />
        ))}
      </Card>

      <Card title={ht.byHand}>
        {whoop?.connected ? <Text style={type.rowSubtitle}>{ht.byHandWhoop}</Text> : null}
        {manualSleep.map((log) => (
          <ListRow key={log.id} leading={<IconTile name="moon" />} title={formatSleepDuration(log.duration_minutes)} subtitle={stamp(`${log.sleep_date}T12:00:00`)} meta={log.quality ? `${t.quality} ${log.quality}/5` : undefined} />
        ))}
        {manualWorkouts.map((workout) => (
          <ListRow key={workout.id} leading={<IconTile name="activity" />} title={workout.type} subtitle={stamp(workout.logged_at)} meta={workout.duration_minutes ? `${workout.duration_minutes} ${t.min}` : undefined} />
        ))}
        {!manualSleep.length && !manualWorkouts.length ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
            <EmptyState example={ht.sleepExample} action={false} />
            <EmptyState example={ht.workoutExample} action={false} />
          </View>
        ) : null}
      </Card>
    </>
  );

  return (
    <Screen wide refreshing={loading} onRefresh={reload}>
      <Columns left={left} right={right} />
    </Screen>
  );
}
