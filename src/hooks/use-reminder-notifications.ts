import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { useBudgetAlerts } from "@/hooks/use-budget-alerts";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { handleMedicationResponse, MEDICATION_CATEGORY, setUpMedicationCategory, useMedicationStockAlerts } from "@/hooks/use-medications";
import { useMorningNotifications } from "@/hooks/use-morning-brief";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { useVehicles } from "@/hooks/use-vehicles";
import { useWidgetSync } from "@/hooks/use-widget-sync";
import { sectionOn, type SectionKey } from "@/lib/app-sections";
import { billRenewalAlerts, formatMoney } from "@/lib/finance";
import { doseKey, medicationAlerts, parseAlertId } from "@/lib/medications";
import { notificationAllowed } from "@/lib/notification-prefs";
import { buildLocalReminderSchedule } from "@/lib/reminder-notifications";
import { vehicleAlerts } from "@/lib/vehicles";
import { installmentAlerts } from "@/lib/wealth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

// Replaces web push: the phone itself alarms for reminders and task reminders,
// rescheduled from the latest data on every load. Works offline once scheduled.
export function useReminderNotifications() {
  const { userId, data, act } = useDashboardData();
  const { vehicles } = useVehicles(userId);
  const prefs = useNotificationPrefs();

  useEffect(() => {
    // Before the saved choice loads, scheduling would undo a switch that is off.
    if (!prefs) return;
    let cancelled = false;
    void (async () => {
      const { granted } = await Notifications.requestPermissionsAsync();
      if (!granted || cancelled) return;
      // Only clear our own alarms; prayer alerts are scheduled separately. A dose's "later" alarm (medsnooze-) stays
      // until it goes off, unless that dose has been answered since.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const answered = new Set(data.medicationDoses.map((dose) => doseKey(dose.medication_id, Date.parse(dose.scheduled_at))));
      const snoozed = new Set<string>();
      for (const item of scheduled) {
        const alarm = item.identifier.startsWith("medsnooze-") ? parseAlertId(item.identifier) : null;
        if (alarm) {
          const key = doseKey(alarm.medicationId, alarm.at);
          if (answered.has(key)) await Notifications.cancelScheduledNotificationAsync(item.identifier);
          else snoozed.add(key);
        }
      }
      await Promise.all(
        scheduled.filter((item) => /^(reminder|task|bill|installment|vehicle|med|medlater)-/.test(item.identifier)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
      );
      // iOS keeps 64 pending alarms: 32 reminders and doses together + 8 bill + 4 installment + 4 car heads-ups
      // + 10 prayers + 4 mornings = 62. Doses take up to 12 of the 32 (reminders keep at least 20).
      // Each kind only when it is on in Notifications.
      // A section switched off in Settings → Sections is quiet too: its alarms were just cleared and are not put back.
      const on = (kind: Parameters<typeof notificationAllowed>[1]) => notificationAllowed(prefs, kind, (key) => sectionOn(data.profile, key as SectionKey));
      const now = new Date();
      const doses = on("medications") ? medicationAlerts({ medications: data.medications, doses: data.medicationDoses, now, limit: 12, snoozed }) : [];
      if (doses.length) await setUpMedicationCategory();
      type Alarm = { id: string; title: string; body: string; at: Date; url: string; category?: string; extra?: Record<string, string> };
      const items: Alarm[] = [
        ...doses.map((item) => ({ ...item, category: MEDICATION_CATEGORY, extra: { medicationId: item.medicationId, scheduledAt: item.scheduledAt } })),
        ...(on("reminders") ? buildLocalReminderSchedule({ reminders: data.reminders, tasks: data.tasks, limit: 32 - doses.length }) : []),
        ...(on("bills") ? billRenewalAlerts(data.bills, now, 1, prefs.headsUp).slice(0, 8) : []),
        ...(on("installments") ? installmentAlerts({ obligations: data.obligations, obligationInstallments: data.obligationInstallments }, now, formatMoney, prefs.headsUp).slice(0, 4) : []),
        ...(on("car") ? vehicleAlerts(vehicles, now, prefs.headsUp).slice(0, 4) : [])
      ];
      for (const item of items) {
        // A newer load took over; stop so a deleted reminder isn't put back.
        if (cancelled) return;
        await Notifications.scheduleNotificationAsync({
          identifier: item.id,
          content: { title: item.title, body: item.body, ...(item.category ? { categoryIdentifier: item.category } : {}), data: { url: item.url, ...item.extra } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at }
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefs, data.profile, data.reminders, data.tasks, data.bills, data.obligations, data.obligationInstallments, data.medications, data.medicationDoses, vehicles]);

  // The latest, for a button tapped on a dose reminder (the listener below is set up once).
  const latest = useRef({ act, medications: data.medications });
  latest.current = { act, medications: data.medications };

  useEffect(() => {
    async function open(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const url = response.notification.request.content.data?.url;
      Notifications.clearLastNotificationResponse();
      // "Taken" saves the dose and then shows the list; "Remind me later" does its work and stays out of the way.
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        const handled = await handleMedicationResponse(response, latest.current.act, latest.current.medications);
        if (handled && response.actionIdentifier !== "taken") return;
      }
      if (typeof url !== "string") return;
      // Today is the root: go back down to it rather than stack a second copy on top.
      if (url === "/") router.dismissTo("/");
      else router.push(url as never);
    }
    // A tap that launched the app from closed arrives before any listener exists.
    void open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => void open(response));
    return () => subscription.remove();
  }, []);
}

// Mounted once in the root layout: keeps reminder and prayer alarms scheduled.
export function ReminderNotifications() {
  useReminderNotifications();
  const { all: prayers } = usePrayerTimes();
  useWidgetSync(prayers);
  useBudgetAlerts();
  useMedicationStockAlerts();
  useMorningNotifications();
  return null;
}
