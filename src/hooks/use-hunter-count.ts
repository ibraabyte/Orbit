import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { getApi, hasServer } from "@/lib/backend";
import { hunterApi, needsLookCount } from "@/lib/subscriptions";

/** How many subscription finds want a decision, for the Finance row. Null until known or when offline. */
export function useHunterCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!hasServer()) return;
      let live = true;
      hunterApi
        .overview(getApi())
        .then((overview) => live && setCount(needsLookCount(overview.finds)))
        .catch(() => live && setCount(null));
      return () => {
        live = false;
      };
    }, [])
  );
  return count;
}
