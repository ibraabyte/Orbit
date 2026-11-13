import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/drift";
import { PlanDayCard } from "@/components/plan-day";
import { Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { planApi, pt, type PlannedDay } from "@/lib/plan";

// One day of the plan: its exercises, a swap on each, and moving it on by a day.
export default function PlanDayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [day, setDay] = useState<PlannedDay | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const api = getApi();
      const [next, week] = await Promise.all([planApi.day(api, id), planApi.week(api)]);
      setDay(next);
      setToday(week.today);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen refreshing={loading && Boolean(day)} onRefresh={() => void load()}>
      {day && today ? <PlanDayCard day={day} today={today} onChange={(next) => (next ? setDay(next) : void load())} /> : loading ? <Loading /> : <EmptyState>{error ?? pt.couldNotLoad}</EmptyState>}
    </Screen>
  );
}
