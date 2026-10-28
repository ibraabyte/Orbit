import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { WatchItem } from "@/lib/types";
import { nextEpisode, type WatchDraft } from "@/lib/watchlist";

// Loaded on its own like useVehicles: `available` is false until migration 0016_watch_items.sql is applied.
export function useWatchlist(userId: string) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await getSupabase().from("watch_items").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
    setAvailable(!error);
    setItems(error ? [] : (data ?? []));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (write: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await write;
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh]
  );

  // Adding something already on the list updates it (notes kept) instead of failing.
  const save = useCallback(
    (draft: WatchDraft) => run(getSupabase().from("watch_items").upsert({ ...draft, user_id: userId }, { onConflict: "user_id,media_type,tmdb_id" })),
    [run, userId]
  );
  const update = useCallback(
    (id: string, changes: Partial<Pick<WatchItem, "status" | "season" | "episode" | "notes">>) => run(getSupabase().from("watch_items").update(changes).eq("id", id).eq("user_id", userId)),
    [run, userId]
  );
  const watchedOne = useCallback((item: WatchItem, newSeason = false) => update(item.id, { status: "watching", ...nextEpisode(item, newSeason) }), [update]);
  const remove = useCallback((id: string) => run(getSupabase().from("watch_items").delete().eq("id", id).eq("user_id", userId)), [run, userId]);

  return { items, available, refresh, save, update, watchedOne, remove };
}
