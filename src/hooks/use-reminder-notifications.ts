import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { buildLocalReminderSchedule } from "@/lib/reminder-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })
});

// Replaces web push: the phone itself alarms for reminders and task reminders,
// rescheduled from the latest data on every load. Works offline once scheduled.
export function useReminderNotifications() {
  const { data } = useDashboardData();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { granted } = await Notifications.requestPermissionsAsync();
      if (!granted || cancelled) return;
      // Only clear our own alarms; prayer alerts are scheduled separately.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled.filter((item) => /^(reminder|task)-/.test(item.identifier)).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier))
      );
      for (const item of buildLocalReminderSchedule({ reminders: data.reminders, tasks: data.tasks })) {
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
  }, [data.reminders, data.tasks]);

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
