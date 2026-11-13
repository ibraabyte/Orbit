import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useState } from "react";
import { loadNotificationPrefs, onNotificationPrefs } from "@/hooks/use-notification-prefs";
import { formatClock } from "@/lib/i18n";
import { notificationAllowed, type NotificationPrefs } from "@/lib/notification-prefs";
import { prayerTimesFor, RIYADH, upcomingPrayers, type PrayerPlace, type PrayerTime } from "@/lib/prayer-times";

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

// Rewritten whole each time: on load and whenever a prayer switch changes in Notifications.
async function schedulePrayerAlerts(place: PrayerPlace, prefs?: NotificationPrefs) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((item) => item.identifier.startsWith("prayer-")).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  const choice = prefs ?? (await loadNotificationPrefs());
  if (!notificationAllowed(choice, "prayer")) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;
  // Two days ahead; reopening the app tops it up. Only the prayers left on.
  for (const prayer of upcomingPrayers(place, new Date(), 2).filter((item) => choice.prayers[item.name])) {
    await Notifications.scheduleNotificationAsync({
      identifier: `prayer-${prayer.name}-${prayer.at.toISOString()}`,
      content: { title: `حان وقت صلاة ${prayer.label}`, body: formatClock(prayer.at) },
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
      void schedulePrayerAlerts(found).catch(() => undefined);
    });
  }, []);

  // A change in Notifications reschedules at once, for the place already found.
  useEffect(() => onNotificationPrefs((prefs) => void schedulePrayerAlerts(place, prefs).catch(() => undefined)), [place]);

  // Drop prayers as they pass.
  useEffect(() => {
    const timer = setInterval(() => setPrayers(upcomingPrayers(place)), 60_000);
    return () => clearInterval(timer);
  }, [place]);

  // All five of today, passed ones too (the Today rail draws them as ticks). Recomputed with the minute tick.
  const today = useMemo(() => prayerTimesFor(place, new Date()), [place, prayers]);
  return { next: prayers[0], upcoming: prayers.slice(0, 5), all: prayers, today };
}
