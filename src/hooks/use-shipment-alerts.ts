import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { sectionOn, type SectionKey } from "@/lib/app-sections";
import { getApi, hasServer } from "@/lib/backend";
import { notificationAllowed } from "@/lib/notification-prefs";
import { alertContent, shipmentsApi } from "@/lib/shipments";

// At most one look per this long, however often the dashboard reloads.
const EVERY_MS = 10 * 60 * 1000;
let lastLook = 0;
// One at a time: two loads close together must not both send the same alert.
let queue: Promise<unknown> = Promise.resolve();

// Shipment news (late, out for delivery, ready for pickup, delivered, a problem) as a phone notification. The server
// checks 17TRACK every few hours and remembers what was already shown (POST /shipments/seen), so each alert goes out
// once, on whichever device opens Orbit first. There is no push from the server yet, so it arrives when Orbit opens.
export function useShipmentAlerts() {
  const { userId, data } = useDashboardData();
  const prefs = useNotificationPrefs();
  const allowed = prefs ? notificationAllowed(prefs, "shipments", (key) => sectionOn(data.profile, key as SectionKey)) : null;

  useEffect(() => {
    if (!allowed || !userId || !hasServer() || Date.now() - lastLook < EVERY_MS) return;
    lastLook = Date.now();
    queue = queue.then(async () => {
      try {
        const overview = await shipmentsApi.overview(getApi());
        const news = overview.shipments.filter((shipment) => shipment.alert);
        if (!news.length) return;
        const { granted } = await Notifications.requestPermissionsAsync();
        // Without permission nothing is marked seen, so the alert still goes out once it is allowed.
        if (!granted) return;
        // Marked before sending, so a failed send loses one alert instead of repeating it on every open.
        await shipmentsApi.seen(getApi(), news.map((shipment) => shipment.id));
        for (const shipment of news) {
          const content = alertContent(shipment);
          if (!content) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: `shipment-${shipment.id}-${shipment.alert}`,
            content: { ...content, data: { url: "/shipments" } },
            trigger: null
          });
        }
      } catch {
        // A notification problem must never reach the screen.
      }
    });
  }, [allowed, userId, data]);
}
