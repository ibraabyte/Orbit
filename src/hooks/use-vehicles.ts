import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Database, Vehicle } from "@/lib/types";

type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = Database["public"]["Tables"]["vehicles"]["Update"];

// Loaded on its own (not in the dashboard batch) so the app keeps working
// before migration 0015_vehicles.sql is applied: `available` is false then.
export function useVehicles(userId: string) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await getSupabase().from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    setAvailable(!error);
    setVehicles(error ? [] : (data ?? []));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (vehicle: Omit<VehicleInsert, "user_id">) => {
      const { error } = await getSupabase().from("vehicles").insert({ ...vehicle, user_id: userId });
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh, userId]
  );

  const update = useCallback(
    async (id: string, changes: VehicleUpdate) => {
      const { error } = await getSupabase().from("vehicles").update(changes).eq("id", id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh, userId]
  );

  return { vehicles, available, refresh, add, update };
}
