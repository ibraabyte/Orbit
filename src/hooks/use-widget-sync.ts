import { requireOptionalNativeModule } from "expo";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { lockEngages } from "@/components/app-lock";
import { emptyData, useDashboardData } from "@/hooks/use-dashboard-data";
import { formatClock24, formatDate, formatNumber, isArabic, t } from "@/lib/i18n";
import type { PrayerTime } from "@/lib/prayer-times";
import { signedOutWidget, widgetWritePlan, writeWidget, type WidgetCopy } from "@/lib/widget-snapshot";

const copy: WidgetCopy = {
  arabic: isArabic,
  time: formatClock24,
  day: (at) => formatDate(at, { weekday: "short", day: "numeric", month: "short" }),
  number: formatNumber,
  today: t.today,
  now: t.now,
  tomorrow: t.dayGroups.tomorrow,
  offRail: t.widgetOffRail,
  nothingAhead: t.widgetNothingAhead,
  openToUpdate: t.widgetOpenToUpdate,
  signedOut: t.widgetSignedOut,
  capture: t.capture,
  kinds: t.railKinds
};

type TodayWidget = (typeof import("@/widgets/today-widget"))["default"];

// Missing in Expo Go and in builds older than the widget. Checked before the require, because Metro reports
// a module that throws while loading as a fatal error, past any try/catch here.
const allowed = Platform.OS === "ios" && requireOptionalNativeModule("ExpoWidgets") !== null;
const load = (): TodayWidget => (require("@/widgets/today-widget") as typeof import("@/widgets/today-widget")).default;

// Replaces the whole timeline, so no task title stays in the App Group.
export function clearWidget() {
  writeWidget(allowed, load, (widget) => widget.updateSnapshot(signedOutWidget(copy)));
}

const resyncs = new Set<() => void>();
// Settings calls this after the app lock changes, so titles leave (or return to) the widget at once.
export const resyncWidget = () => resyncs.forEach((run) => run());

// Mounted while signed in: rewrites the widget when dashboard data, prayer times or the app lock change.
export function useWidgetSync(prayers: PrayerTime[]) {
  const { data, loading } = useDashboardData();
  const written = useRef("");
  const [lockChanged, setLockChanged] = useState(0);

  useEffect(() => {
    const run = () => setLockChanged((count) => count + 1);
    resyncs.add(run);
    return () => void resyncs.delete(run);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    // Cancelled on unmount, so a slow read can't put titles back after sign-out cleared them.
    let cancelled = false;
    // Titles are hidden only when the app really locks; lockEngages assumes locked if it can't tell.
    void lockEngages().then((hideTitles) => {
      if (cancelled) return;
      writeWidget(allowed, load, (widget) => {
        const plan = widgetWritePlan({ loading, loaded: data !== emptyData, data, prayers, now: new Date(), copy, hideTitles, lastKey: written.current });
        if (!plan) return;
        widget.updateTimeline(plan.entries);
        written.current = plan.key;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [data, loading, prayers, lockChanged]);
}
