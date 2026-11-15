import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { getApi, hasServer } from "@/lib/backend";
import { leaveAlerts, mapsApi, parseTravelPrefs, tasksToTime, TRAVEL_KEY, type Position, type TravelPrefs } from "@/lib/maps";
import { notificationAllowed } from "@/lib/notification-prefs";

// At most one look per this long, however often the dashboard reloads or the app comes back.
const EVERY_MS = 10 * 60 * 1000;
let lastLook = 0;
let queue: Promise<unknown> = Promise.resolve();

export async function loadTravelPrefs(): Promise<TravelPrefs> {
  return parseTravelPrefs(await AsyncStorage.getItem(TRAVEL_KEY).catch(() => null));
}

export async function saveTravelPrefs(prefs: TravelPrefs) {
  await AsyncStorage.setItem(TRAVEL_KEY, JSON.stringify(prefs));
  lastLook = 0;
}

/** Where the phone is, only if location is already allowed or allowed now; null otherwise. */
export async function phonePosition(ask = true): Promise<Position | null> {
  try {
    const permission = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    // A fresh fix when it can: the way from where you were an hour ago is not much use.
    const position = (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null;
  } catch {
    return null;
  }
}

// Time to leave for each appointment with a place, as a phone notification at that moment. Timed with Google Maps
// (the person's own key) from where the phone is when Orbit opens, so traffic and position are those of that moment.
// Opening Orbit again re-times them and replaces the alerts. Nothing runs while Orbit stays closed (no push yet).
export function useLeaveAlerts() {
  const { userId, data } = useDashboardData();
  const prefs = useNotificationPrefs();
  const allowed = prefs ? notificationAllowed(prefs, "leave") : null;
  const [awake, setAwake] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setAwake((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (allowed === null || !userId || !hasServer()) return;
    const due = tasksToTime(data.tasks, new Date());
    queue = queue.then(async () => {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const ours = scheduled.filter((item) => item.identifier.startsWith("leave-"));
        if (!allowed || !due.length) {
          await Promise.all(ours.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
          return;
        }
        if (Date.now() - lastLook < EVERY_MS) return;
        lastLook = Date.now();
        const status = await mapsApi.status(getApi()).catch(() => null);
        if (!status?.connected) return;
        const { granted } = await Notifications.getPermissionsAsync();
        if (!granted) return;
        const origin = await phonePosition(false);
        if (!origin) return;
        const reply = await mapsApi.leave(getApi(), origin, await loadTravelPrefs());
        const alerts = leaveAlerts(reply.items, new Date());
        const keep = new Set(alerts.map((alert) => alert.id));
        await Promise.all(ours.filter((item) => !keep.has(item.identifier)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
        const have = new Set(ours.map((item) => item.identifier));
        // Which appointments were already alerted (timed or "leave now"), kept across restarts.
        const sentRaw = await AsyncStorage.getItem("orbit.leave.sent").catch(() => null);
        const sent = new Set<string>(sentRaw ? (JSON.parse(sentRaw) as string[]) : []);
        // A task whose timed alert is still waiting (it is being replaced) has not been told yet.
        const waiting = new Set(ours.map((item) => item.identifier.split("-").slice(1, -1).join("-")));
        for (const alert of alerts) {
          if (have.has(alert.id)) {
            sent.add(alert.once);
            continue;
          }
          // Past its time: "leave now", unless an alert for this appointment already went out (or fired on its own).
          if (alert.at === null && sent.has(alert.once) && !waiting.has(alert.taskId)) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: alert.id,
            content: { title: alert.title, body: alert.body, data: { url: `/task/${alert.taskId}` } },
            trigger: alert.at ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alert.at } : null
          });
          sent.add(alert.once);
        }
        await AsyncStorage.setItem("orbit.leave.sent", JSON.stringify([...sent].slice(-50))).catch(() => undefined);
      } catch {
        // A notification problem must never reach the screen.
      }
    });
  }, [allowed, userId, data, awake]);
}
