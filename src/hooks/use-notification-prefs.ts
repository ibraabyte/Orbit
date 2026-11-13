import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { NOTIFICATION_DEFAULT, parseNotificationPrefs, type NotificationPrefs } from "@/lib/notification-prefs";

const KEY = "orbit.notifications";
// The old single prayer switch, from before Notifications had its own screen.
const LEGACY_PRAYER_KEY = "orbit.prayer-alerts";
const listeners = new Set<(prefs: NotificationPrefs) => void>();

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const legacyOff = raw ? false : (await SecureStore.getItemAsync(LEGACY_PRAYER_KEY).catch(() => null)) === "off";
    return parseNotificationPrefs(raw, legacyOff);
  } catch {
    return NOTIFICATION_DEFAULT;
  }
}

// Throws if it could not be saved, so the screen never shows a change that did not happen.
// Every scheduler listening reschedules from the new choice at once.
export async function saveNotificationPrefs(prefs: NotificationPrefs) {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  listeners.forEach((listener) => listener(prefs));
}

export function onNotificationPrefs(listener: (prefs: NotificationPrefs) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The saved choice; null until it has loaded, so nothing is scheduled from a guess. */
export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  useEffect(() => {
    let live = true;
    void loadNotificationPrefs().then((loaded) => live && setPrefs((current) => current ?? loaded));
    const off = onNotificationPrefs(setPrefs);
    return () => {
      live = false;
      off();
    };
  }, []);
  return prefs;
}
