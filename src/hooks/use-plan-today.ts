import { useCallback, useEffect, useState } from "react";
import { getApi, hasServer } from "@/lib/backend";
import { planApi, todayOf, type PlannedDay } from "@/lib/plan";

// Today's workout from the automatic plan, for its card on Today. null with no plan, a rest day, or no server.
export function usePlanToday(enabled: boolean) {
  const [day, setDay] = useState<PlannedDay | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !hasServer()) return setDay(null);
    try {
      const week = await planApi.week(getApi());
      setDay(week.plan ? todayOf(week) : null);
    } catch {
      // Keep what was there; the card is a shortcut, never an error on Today.
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { day, refresh };
}
