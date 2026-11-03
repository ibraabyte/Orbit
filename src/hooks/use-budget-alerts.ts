import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { budgetProgress, formatMoney, monthKey, newBudgetAlerts } from "@/lib/finance";
import { t } from "@/lib/i18n";

// What already went out, per user, so an alert never repeats (not on reload, not after a restart).
// Sent at once rather than scheduled: nothing pending for the reminder hook's cancel filter or sign-out to remove.
const firedKey = (userId: string) => `orbit.budget-alerts.${userId}`;

async function readFired(userId: string): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(firedKey(userId))) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

// Runs one at a time: two loads close together must not both read the old list and both send.
let queue: Promise<unknown> = Promise.resolve();

// When dashboard data loads: one local notification per month, category and threshold (80%, 100%).
export function useBudgetAlerts() {
  const { userId, data } = useDashboardData();

  useEffect(() => {
    let stale = false;
    queue = queue.then(async () => {
      try {
        if (stale) return;
        const { alerts, fired } = newBudgetAlerts(budgetProgress(data.budgets, data.expenses, monthKey(new Date())), await readFired(userId));
        if (!alerts.length) return;
        const { granted } = await Notifications.requestPermissionsAsync();
        // Without permission nothing is remembered, so the alert still goes out once it is allowed.
        if (!granted) return;
        // ponytail: remembered before sending, so a failed send loses one alert instead of repeating it.
        await AsyncStorage.setItem(firedKey(userId), JSON.stringify(fired));
        for (const alert of alerts) {
          await Notifications.scheduleNotificationAsync({
            identifier: alert.id,
            content: {
              title: `${t.financeCategoryNames[alert.category]} · ${t.budget}`,
              body: `${alert.threshold === 100 ? t.budgetAlertOver : t.budgetAlertNear} · ${formatMoney(alert.spent, alert.currency)} / ${formatMoney(alert.limit, alert.currency)}`,
              data: { url: "/finance" }
            },
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
  }, [userId, data.budgets, data.expenses]);
}
