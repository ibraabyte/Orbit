import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { useVehicles } from "@/hooks/use-vehicles";
import { billRenewalAlerts } from "@/lib/finance";
import { buildLocalReminderSchedule } from "@/lib/reminder-notifications";
import { vehicleAlerts } from "@/lib/vehicles";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

// Replaces web push: the phone itself alarms for reminders and task reminders,
// rescheduled from the latest data on every load. Works offline once scheduled.
export function useReminderNotifications() {
  const { userId, data } = useDashboardData();
  const { vehicles } = useVehicles(userId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { granted } = await Notifications.requestPermissionsAsync();
      if (!granted || cancelled) return;
      // Only clear our own alarms; prayer alerts are scheduled separately.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled.filter((item) => /^(reminder|task|bill|vehicle)-/.test(item.identifier)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
      );
      // iOS keeps 64 pending alarms: 40 reminders + 8 bill + 4 car heads-ups + 10 prayers = 62.
      const items = [
        ...buildLocalReminderSchedule({ reminders: data.reminders, tasks: data.tasks, limit: 40 }),
        ...billRenewalAlerts(data.bills).slice(0, 8),
        ...vehicleAlerts(vehicles).slice(0, 4)
      ];
      for (const item of items) {
        await Notifications.scheduleNotificationAsync({
          identifier: item.id,
          content: { title: item.title, body: item.body, data: { url: item.url } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at }
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.reminders, data.tasks, data.bills, vehicles]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string") router.push(url as never);
    });
    return () => subscription.remove();
  }, []);
}

// Mounted once in the root layout: keeps reminder and prayer alarms scheduled.
export function ReminderNotifications() {
  useReminderNotifications();
  usePrayerTimes();
  return null;
}
