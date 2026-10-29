import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/backend";
import type { WatchItem } from "@/lib/types";
import { nextEpisode, type WatchDraft } from "@/lib/watchlist";

// Loaded on its own like useVehicles. `available` is false when the last load failed.
export function useWatchlist(userId: string) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setItems(await getApi().get<WatchItem[]>("/watch-items"));
      setAvailable(true);
    } catch {
      setAvailable(false);
      setItems([]);
    }
    // userId: reload when a different account signs in.
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (write: () => Promise<unknown>) => {
      await write();
      await refresh();
    },
    [refresh]
  );

  // Adding something already on the list updates it instead of failing (one row per title).
  const save = useCallback((draft: WatchDraft) => run(() => getApi().put("/watch-items", draft)), [run]);
  const update = useCallback(
    (id: string, changes: Partial<Pick<WatchItem, "status" | "season" | "episode" | "notes">>) => run(() => getApi().patch(`/watch-items/${encodeURIComponent(id)}`, changes)),
    [run]
  );
  const watchedOne = useCallback((item: WatchItem, newSeason = false) => update(item.id, { status: "watching", ...nextEpisode(item, newSeason) }), [update]);
  const remove = useCallback((id: string) => run(() => getApi().delete(`/watch-items/${encodeURIComponent(id)}`)), [run]);

  return { items, available, refresh, save, update, watchedOne, remove };
}
