import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { RIYADH, upcomingPrayers, type PrayerPlace, type PrayerTime } from "@/lib/prayer-times";

const PRAYER_ALERTS_KEY = "orbit.prayer-alerts";

export async function arePrayerAlertsEnabled() {
  return (await SecureStore.getItemAsync(PRAYER_ALERTS_KEY)) !== "off";
}

export async function setPrayerAlertsEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(PRAYER_ALERTS_KEY, enabled ? "on" : "off");
  await schedulePrayerAlerts();
}

// Uses the phone's rough location once; falls back to Riyadh if location is off.
async function currentPlace(): Promise<PrayerPlace> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return RIYADH;
    const position = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : RIYADH;
  } catch {
    return RIYADH;
  }
}

async function schedulePrayerAlerts(place?: PrayerPlace) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((item) => item.identifier.startsWith("prayer-")).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  if (!(await arePrayerAlertsEnabled())) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  // Two days ahead; reopening the app tops it up.
  for (const prayer of upcomingPrayers(place ?? (await currentPlace()), new Date(), 2)) {
    await Notifications.scheduleNotificationAsync({
      identifier: `prayer-${prayer.name}-${prayer.at.toISOString()}`,
      content: { title: `حان وقت صلاة ${prayer.label}`, body: prayer.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: prayer.at }
    });
  }
}

// Today's coming prayers for display, plus prayer-time alerts scheduled on the phone.
export function usePrayerTimes() {
  const [place, setPlace] = useState<PrayerPlace>(RIYADH);
  const [prayers, setPrayers] = useState<PrayerTime[]>(() => upcomingPrayers(RIYADH));

  useEffect(() => {
    void currentPlace().then((found) => {
      setPlace(found);
      setPrayers(upcomingPrayers(found));
      void schedulePrayerAlerts(found);
    });
  }, []);

  // Drop prayers as they pass.
  useEffect(() => {
    const timer = setInterval(() => setPrayers(upcomingPrayers(place)), 60_000);
    return () => clearInterval(timer);
  }, [place]);

  return { next: prayers[0], upcoming: prayers.slice(0, 5) };
}
