import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { lockEngages } from "@/components/app-lock";
import { loadAskConsent } from "@/hooks/use-ask-consent";
import { emptyData, useDashboardData } from "@/hooks/use-dashboard-data";
import { activeProvider, briefStep, serverDetail } from "@/lib/ask";
import { getApi } from "@/lib/backend";
import { isArabic, t } from "@/lib/i18n";
import { integrationsApi } from "@/lib/integrations";
import { localDateKey } from "@/lib/insights";
import { briefCacheKey, briefPlan, isNoAiError, MORNING_DEFAULT, morningNotifications, parseBriefCache, parseMorningSettings, type BriefSeen, type MorningLabels, type MorningSettings } from "@/lib/morning-brief";

// The morning text in the app's language, for the alert and for the card without AI.
export const morningLabels: MorningLabels = { title: t.morningTitle, clear: t.morningClear, tasks: t.morningTasks, overdue: t.morningOverdue, reminder: t.morningReminder, reminders: t.morningReminders, bill: t.morningBill, bills: t.morningBills, first: t.morningFirst };

// consent: the person has not agreed (for the AI connected now) to send their day to it, so nothing was sent.
export type BriefState = { status: "loading" } | { status: "ready"; text: string } | { status: "no-ai" } | { status: "consent" } | { status: "error"; message: string };

// The written brief for today. The server writes it through the user's own AI; it is asked once per local day
// and kept on the phone, and only a pull-to-refresh or the retry button asks again. It sends data to the AI, so it needs the
// agreement given on the Ask screen: without it no call is made and no saved AI text is shown.
export function useMorningBrief(enabled = true) {
  const { userId } = useDashboardData();
  const [state, setState] = useState<BriefState>({ status: "loading" });
  const asking = useRef(false);
  const seen = useRef<BriefSeen>(null);
  const loadedDay = useRef("");
  const locale = isArabic ? "ar" : "en";

  const show = useCallback((next: BriefState) => {
    if (seen.current) seen.current.status = next.status;
    setState(next);
  }, []);
  const dropCache = useCallback(() => void AsyncStorage.removeItem(briefCacheKey(userId)).catch(() => undefined), [userId]);

  // force: pull-to-refresh or the retry button. Otherwise see briefPlan: coming back to Today re-checks the agreement and
  // the saved copy, and only goes to the network when something changed.
  const load = useCallback(
    async (force: boolean): Promise<void> => {
      const date = localDateKey(new Date());
      loadedDay.current = date;
      const accepted = await loadAskConsent(userId);
      let cached: string | null = null;
      if (accepted !== null && !force) {
        try {
          cached = parseBriefCache(await AsyncStorage.getItem(briefCacheKey(userId)), date, locale, accepted);
        } catch {
          // No readable copy: ask the server.
        }
      }
      const plan = briefPlan({ accepted, cached, force, date, seen: seen.current });
      seen.current = { day: date, accepted, status: seen.current?.status ?? "loading" };
      if (plan === "consent") {
        dropCache();
        return show({ status: "consent" });
      }
      if (plan === "show-cache") return show({ status: "ready", text: cached ?? "" });
      if (plan === "keep" || asking.current || accepted === null) return;
      asking.current = true;
      show({ status: "loading" });
      let again = false;
      try {
        // The agreement is for one AI; check it is still the one that would get the data.
        const provider = activeProvider(await integrationsApi.overview(getApi()));
        const step = briefStep(accepted, provider);
        if (step !== "ask" || provider === null) {
          dropCache();
          return show({ status: step === "ask" ? "no-ai" : step });
        }
        // Withdrawn while the overview was loading: nothing is sent.
        if ((await loadAskConsent(userId)) !== accepted) {
          seen.current = null;
          again = true;
          return;
        }
        const { text } = await getApi().post<{ text: string }>("/assistant/brief", { date, locale });
        // The agreement may have been withdrawn or changed while the AI was writing: then the text is dropped, not shown or saved.
        const now = await loadAskConsent(userId);
        if (now !== accepted) {
          dropCache();
          if (now === null) return show({ status: "consent" });
          // Forget what this load saw, so the next one asks for the new AI instead of keeping "loading".
          seen.current = null;
          again = true;
          return;
        }
        show({ status: "ready", text });
        void AsyncStorage.setItem(briefCacheKey(userId), JSON.stringify({ date, locale, provider, text })).catch(() => undefined);
      } catch (error) {
        show(isNoAiError(error) ? { status: "no-ai" } : { status: "error", message: serverDetail(error, isArabic) });
      } finally {
        asking.current = false;
        // Midnight passed while asking: the load for the new day returned early, so run it now.
        if (localDateKey(new Date()) !== date) again = true;
        if (again) void load(false);
      }
    },
    [userId, locale, show, dropCache]
  );

  // Also when coming back from the Ask screen, where the agreement is given or withdrawn.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void load(false);
    }, [enabled, load])
  );

  // The app can stay open past midnight; a new day gets a new brief.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && localDateKey(new Date()) !== loadedDay.current) void load(false);
    });
    return () => subscription.remove();
  }, [enabled, load]);

  const refresh = useCallback(() => (enabled ? load(true) : Promise.resolve()), [enabled, load]);
  return { state, refresh };
}

const SETTINGS_KEY = "orbit.morning";
const listeners = new Set<(settings: MorningSettings) => void>();

export async function loadMorningSettings() {
  try {
    return parseMorningSettings(await AsyncStorage.getItem(SETTINGS_KEY));
  } catch {
    return MORNING_DEFAULT;
  }
}

// Throws if it could not be saved, so Settings never shows a change that did not happen.
export async function saveMorningSettings(settings: MorningSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  listeners.forEach((listener) => listener(settings));
}

// Keeps the next few "morning-" alerts scheduled on the phone, rewritten from the latest data on every load.
// Mounted once in the root layout. Only "morning-" ones are replaced, so reminder, bill, car and prayer alarms are untouched.
export function useMorningNotifications() {
  const { data } = useDashboardData();
  const [settings, setSettings] = useState<MorningSettings | null>(null);

  useEffect(() => {
    void loadMorningSettings().then(setSettings);
    listeners.add(setSettings);
    return () => void listeners.delete(setSettings);
  }, []);

  useEffect(() => {
    // Before the first load there is nothing true to say ("Nothing due today" would be a guess).
    if (!settings || data === emptyData) return;
    let cancelled = false;
    void (async () => {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(scheduled.filter((item) => item.identifier.startsWith("morning-")).map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
        if (!settings.enabled) return;
        const { granted } = await Notifications.requestPermissionsAsync();
        if (!granted) return;
        const hideTitles = await lockEngages();
        for (const item of morningNotifications(data, new Date(), settings, morningLabels, hideTitles)) {
          // A newer load took over; stop so an old text isn't put back.
          if (cancelled) return;
          await Notifications.scheduleNotificationAsync({
            identifier: item.id,
            content: { title: item.title, body: item.body, data: { url: item.url } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at }
          });
        }
      } catch {
        // A notification problem must never reach the screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings, data.tasks, data.reminders, data.bills]);
}
