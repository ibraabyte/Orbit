import { useCallback, useEffect, useState } from "react";
import { getApi, hasServer } from "@/lib/backend";
import { freshRecovery } from "@/lib/rail";
import { whoopApi } from "@/lib/whoop";

// Today's WHOOP recovery for the readiness number on Today. null when WHOOP isn't connected, has no fresh score,
// or the server can't be reached: Today then shows the next prayer in its place.
export function useReadiness() {
  const [value, setValue] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!hasServer()) return;
    try {
      const api = getApi();
      const status = await whoopApi.status(api);
      if (!status.connected) return setValue(null);
      const summary = await whoopApi.summary(api, 2);
      setValue(freshRecovery(summary.latest.recovery));
    } catch {
      // Keep the last number; readiness is a nice-to-have, never an error on Today.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { value, refresh };
}
