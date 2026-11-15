import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { appleHealthApi, localKey, type AppleHealthDay } from "@/lib/apple-health";
import { appleHealthAvailable, syncAppleHealth } from "@/lib/apple-health-native";
import { getApi, hasServer } from "@/lib/backend";

// The last two weeks from Apple Health, oldest first ([] when not connected). Once connected, opening a screen
// that shows them also sends the newest numbers from this iPhone (at most every 15 minutes).
export function useAppleHealth() {
  const [days, setDays] = useState<AppleHealthDay[]>([]);

  const load = useCallback(async () => {
    if (!hasServer()) return;
    const api = getApi();
    try {
      const saved = await appleHealthApi.days(api, 14);
      setDays(saved);
      if (saved.length && appleHealthAvailable && (await syncAppleHealth(api))) setDays(await appleHealthApi.days(api, 14));
    } catch {
      // Apple Health is extra; WHOOP and what you logged still show.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const today = days.find((day) => day.date === localKey(new Date())) ?? null;
  return { days, today, refresh: load };
}
