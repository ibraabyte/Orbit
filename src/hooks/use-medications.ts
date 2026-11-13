import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { sectionOn, type SectionKey } from "@/lib/app-sections";
import { getApi } from "@/lib/backend";
import { alertIds, doseAlert, medicationsApi, rx, SNOOZE_MINUTES, stockAlerts, stockText, type ScheduledDose } from "@/lib/medications";
import { notificationAllowed } from "@/lib/notification-prefs";
import type { Medication } from "@/lib/types";

// The buttons on a dose reminder. "Taken" opens the app so the dose is surely saved (it needs the server);
// "Remind me later" works without opening it: a follow-up is already scheduled, and if the app can act it sets one
// sooner (lib/medications FOLLOW_UP_MINUTES, SNOOZE_MINUTES).
export const MEDICATION_CATEGORY = "medication";
const TAKEN = "taken";
const LATER = "later";

let categoryReady: Promise<unknown> | null = null;
export function setUpMedicationCategory() {
  if (Platform.OS === "web") return Promise.resolve();
  categoryReady ??= Notifications.setNotificationCategoryAsync(MEDICATION_CATEGORY, [
    { identifier: TAKEN, buttonTitle: rx.actionTaken, options: { opensAppToForeground: true } },
    { identifier: LATER, buttonTitle: rx.actionLater, options: { opensAppToForeground: false } }
  ]).catch(() => undefined);
  return categoryReady;
}

/** Clears every alarm of one dose: on time, the follow-up and a "later" one. */
export async function cancelDoseAlerts(medicationId: string, at: Date) {
  await Promise.all(alertIds(medicationId, at).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

type Act = (write: () => PromiseLike<unknown>) => Promise<boolean>;

/**
 * A tap on a dose reminder's button. True when it was one (the caller then leaves it alone).
 * Taken: saved, and that dose's other alarms cleared. Later: one more alarm SNOOZE_MINUTES from now.
 */
export async function handleMedicationResponse(response: Notifications.NotificationResponse, act: Act, medications: Medication[]) {
  const data = response.notification.request.content.data as { medicationId?: unknown; scheduledAt?: unknown } | undefined;
  if (typeof data?.medicationId !== "string" || typeof data.scheduledAt !== "string") return false;
  const medicationId = data.medicationId;
  const at = new Date(data.scheduledAt);
  if (response.actionIdentifier === TAKEN) {
    await cancelDoseAlerts(medicationId, at);
    await act(() => medicationsApi.answer(getApi(), medicationId, at, "taken"));
    return true;
  }
  if (response.actionIdentifier === LATER) {
    const medication = medications.find((item) => item.id === medicationId);
    const [, followUp] = alertIds(medicationId, at);
    await Notifications.cancelScheduledNotificationAsync(followUp).catch(() => undefined);
    if (medication) {
      const alert = doseAlert("snooze", medication, at, new Date(Date.now() + SNOOZE_MINUTES * 60_000));
      await setUpMedicationCategory();
      await Notifications.scheduleNotificationAsync({
        identifier: alert.id,
        content: { title: alert.title, body: alert.body, categoryIdentifier: MEDICATION_CATEGORY, data: { url: alert.url, medicationId, scheduledAt: alert.scheduledAt } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: alert.at }
      }).catch(() => undefined);
    }
    return true;
  }
  return false;
}

/** Taken / skipped / undo from a screen. Its alarms are cleared at once; the reschedule after the reload does the rest. */
export function useDoseActions() {
  const { act } = useDashboardData();
  const answer = useCallback(
    async (entry: ScheduledDose, status: "taken" | "skipped") => {
      void cancelDoseAlerts(entry.medication.id, entry.at);
      return act(() => medicationsApi.answer(getApi(), entry.medication.id, entry.at, status));
    },
    [act]
  );
  const undo = useCallback((entry: ScheduledDose) => (entry.dose ? act(() => medicationsApi.undo(getApi(), entry.dose!.id)) : Promise.resolve(false)), [act]);
  return { take: (entry: ScheduledDose) => answer(entry, "taken"), skip: (entry: ScheduledDose) => answer(entry, "skipped"), undo };
}

// Which medicines were already warned about, per user, so a warning goes out once each time one runs low.
const warnedKey = (userId: string) => `orbit.medication-stock.${userId}`;

async function readWarned(userId: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(warnedKey(userId))) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** When the medicines load: one notification when one falls to its low-stock mark. Sent at once, not scheduled. */
export function useMedicationStockAlerts() {
  const { userId, data } = useDashboardData();
  const prefs = useNotificationPrefs();
  const allowed = prefs ? notificationAllowed(prefs, "medStock", (key) => sectionOn(data.profile, key as SectionKey)) : null;

  useEffect(() => {
    if (!allowed) return;
    let stale = false;
    queue = queue.then(async () => {
      try {
        if (stale) return;
        const warned = await readWarned(userId);
        const { alerts, keep } = stockAlerts(data.medications, warned);
        if (!alerts.length) {
          // Restocked ones are forgotten, so running low again warns again.
          if (keep.length !== warned.length) await AsyncStorage.setItem(warnedKey(userId), JSON.stringify(keep));
          return;
        }
        const { granted } = await Notifications.requestPermissionsAsync();
        if (!granted) return;
        await AsyncStorage.setItem(warnedKey(userId), JSON.stringify(keep));
        for (const medication of alerts) {
          await Notifications.scheduleNotificationAsync({
            identifier: `medstock-${medication.id}`,
            content: { title: rx.lowAlertTitle(medication.name), body: rx.lowAlertBody(stockText(medication) ?? ""), data: { url: "/medications" } },
            trigger: null
          });
        }
      } catch {
        // A notification problem must never reach the screen.
      }
    });
    return () => {
      stale = true;
    };
  }, [allowed, userId, data.medications]);
}
