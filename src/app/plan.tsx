import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Card, EmptyState, IconTile, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { PlanDayCard } from "@/components/plan-day";
import { Button, Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";
import { addDays, dayLabel, dayMuscles, planApi, pt, todayOf, type PlannedDay, type Week } from "@/lib/plan";

// The automatic plan: today's workout fitted to recovery, then the rest of the week. With no plan yet, a way to set one up.
export default function PlanScreen() {
  const { toast } = useOverlays();
  const [week, setWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWeek(await planApi.week(getApi()));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // A swap answers with the changed day: show it at once, no reload needed.
  const changed = (day?: PlannedDay) => {
    if (day && week) setWeek({ ...week, days: week.days.map((item) => (item.id === day.id ? day : item)) });
    else void load();
  };

  const stop = () =>
    Alert.alert(pt.stopTitle, pt.stopBody, [
      {
        text: pt.stop,
        style: "destructive",
        onPress: () =>
          void planApi
            .stop(getApi())
            .then(() => {
              toast(pt.stopped);
              return load();
            })
            .catch((stopError) => toast(stopError instanceof Error ? stopError.message : String(stopError)))
      },
      { text: t.cancel, style: "cancel" }
    ]);

  if (!week) {
    return (
      <Screen refreshing={loading} onRefresh={() => void load()}>
        {loading ? <Loading /> : <EmptyState>{error ?? pt.couldNotLoad}</EmptyState>}
      </Screen>
    );
  }

  if (!week.plan) {
    return (
      <Screen refreshing={loading} onRefresh={() => void load()}>
        <Card>
          <EmptyState icon="calendar" action={{ label: pt.setUp, onPress: () => router.push("/plan-setup") }}>
            {pt.setUpDetail}
          </EmptyState>
        </Card>
      </Screen>
    );
  }

  const today = todayOf(week);
  const rest = week.days.filter((day) => day.date !== week.today);
  // Seven rows from tomorrow, rest days included, so the week reads as a whole.
  const upcoming = Array.from({ length: 6 }, (_, index) => addDays(week.today, index + 1));

  return (
    <Screen refreshing={loading} onRefresh={() => void load()}>
      {week.gym_empty ? (
        <Card>
          <ListRow first leading={<IconTile name="home" tone="accent" />} title={pt.gymEmpty} trailing={<RowButton label={pt.gymAction} onPress={() => router.push("/gym")} />} />
        </Card>
      ) : null}

      {today ? (
        <PlanDayCard day={today} today={week.today} onChange={changed} />
      ) : (
        <Card title={pt.today}>
          <EmptyState icon="moon" action={false}>{`${pt.restToday} · ${pt.restTodayDetail}`}</EmptyState>
        </Card>
      )}

      <Card title={pt.thisWeek}>
        {upcoming.map((date, index) => {
          const day = rest.find((item) => item.date === date);
          return day ? (
            <ListRow
              key={date}
              first={index === 0}
              href={{ pathname: "/plan-day", params: { id: day.id } }}
              title={`${dayLabel(date, week.today)} · ${pt.kinds[day.kind]}`}
              subtitle={[dayMuscles(day), pt.exercises(day.exercises.length)].filter(Boolean).join(" · ")}
            />
          ) : (
            <ListRow key={date} first={index === 0} title={dayLabel(date, week.today)} meta={pt.restDay} />
          );
        })}
      </Card>

      <View style={{ gap: 8 }}>
        <Button variant="outline" title={pt.edit} onPress={() => router.push("/plan-setup")} />
        <Text style={[type.shellMuted, { textAlign: "center" }]} onPress={stop} accessibilityRole="button">
          {pt.stop}
        </Text>
      </View>
    </Screen>
  );
}
