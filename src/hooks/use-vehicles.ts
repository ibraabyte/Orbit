import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/backend";
import type { Vehicle } from "@/lib/types";

type VehicleInput = Omit<Vehicle, "id" | "user_id" | "created_at" | "updated_at">;

// Loaded on its own (not in the dashboard batch). `available` is false when the last load failed.
export function useVehicles(userId: string) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setVehicles(await getApi().get<Vehicle[]>("/vehicles"));
      setAvailable(true);
    } catch {
      setAvailable(false);
      setVehicles([]);
    }
    // userId: reload when a different account signs in.
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (vehicle: VehicleInput) => {
      await getApi().post("/vehicles", vehicle);
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, changes: Partial<VehicleInput>) => {
      await getApi().patch(`/vehicles/${encodeURIComponent(id)}`, changes);
      await refresh();
    },
    [refresh]
  );

  return { vehicles, available, refresh, add, update };
}
