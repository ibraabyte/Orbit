import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { loadAskConsent } from "@/hooks/use-ask-consent";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { ApiError } from "@/lib/api";
import { activeProvider, briefStep, serverDetail } from "@/lib/ask";
import { getApi } from "@/lib/backend";
import { dayPlanBody, dayPlanCacheKey, dayPlanCacheValue, parseDayPlanCache, type DayPlan } from "@/lib/day-plan";
import { featureAi } from "@/lib/feature-models";
import { isArabic } from "@/lib/i18n";
import { localDateKey } from "@/lib/insights";
import { aiQuery, integrationsApi } from "@/lib/integrations";
import { isNoAiError } from "@/lib/morning-brief";
import type { PrayerTime } from "@/lib/prayer-times";

// Why a plan came from the rules and not from the AI: none connected, not agreed to, or the AI failed or answered badly.
export type PlanReason = "no-ai" | "consent" | "ai-failed" | null;
export type DayPlanState = { status: "loading" } | { status: "ready"; plan: DayPlan; reason: PlanReason } | { status: "error"; message: string };

// Today's plan. With an AI connected and the person's agreement (the same one as Ask Orbit and the morning brief), the
// server asks that AI once per local day and the plan is kept on the phone; "plan again" asks again from the time now.
// Without them, or when the AI fails, the server lays the day out with simple rules: nothing is sent anywhere.
// Prayer times are worked out on the phone; only the five times go to the server, never the location.
export function useDayPlan(prayers: PrayerTime[], enabled = true) {
  const { userId } = useDashboardData();
  const [state, setState] = useState<DayPlanState>({ status: "loading" });
  const asking = useRef(false);
  // The day and agreement the last load saw: coming back to Today only loads again when one of them changed.
  // "No AI" and "not agreed" are fixed on other screens, so those plans are checked again on every return.
  const seen = useRef<{ day: string; accepted: string | null; again: boolean } | null>(null);
  const prayersRef = useRef(prayers);
  prayersRef.current = prayers;
  const locale = isArabic ? "ar" : "en";

  const load = useCallback(
    async (force: boolean) => {
      if (asking.current) return;
      const now = new Date();
      const day = localDateKey(now);
      const accepted = await loadAskConsent(userId);
      if (!force && seen.current && !seen.current.again && seen.current.day === day && seen.current.accepted === accepted) return;
      asking.current = true;
      seen.current = { day, accepted, again: false };
      const body = dayPlanBody(prayersRef.current, now, locale);
      const drop = () => void AsyncStorage.removeItem(dayPlanCacheKey(userId)).catch(() => undefined);
      const rules = async (reason: PlanReason) => {
        const plan = await getApi().post<DayPlan>("/assistant/day/draft", body);
        if (seen.current && (reason === "no-ai" || reason === "consent")) seen.current.again = true;
        setState({ status: "ready", plan, reason });
      };
      try {
        if (accepted !== null && !force) {
          const cached = parseDayPlanCache(await AsyncStorage.getItem(dayPlanCacheKey(userId)).catch(() => null), day, locale, accepted);
          if (cached) return setState({ status: "ready", plan: cached, reason: null });
        }
        setState((current) => (current.status === "ready" ? current : { status: "loading" }));
        // The AI set for the assistant in Integrations, else the default; asked for by name so the agreement matches it.
        const overview = await integrationsApi.overview(getApi());
        const picked = featureAi(overview, "assistant");
        const provider = activeProvider(overview, picked);
        const step = briefStep(accepted, provider);
        if (step !== "ask" || provider === null) {
          drop();
          return await rules(step === "consent" ? "consent" : "no-ai");
        }
        let plan: DayPlan;
        try {
          plan = await getApi().post<DayPlan>(`/assistant/day${aiQuery(picked)}`, body);
        } catch (error) {
          // A server or network problem is not the AI's fault: show it. The AI being down or unconnected gets the rules plan.
          if (isNoAiError(error)) return await rules("no-ai");
          if (error instanceof ApiError && error.status === 502) return await rules("ai-failed");
          throw error;
        }
        // Withdrawn or changed while the AI was planning: the plan is dropped, and the rules one shown instead.
        if ((await loadAskConsent(userId)) !== accepted) {
          drop();
          seen.current = null;
          return await rules("consent");
        }
        setState({ status: "ready", plan, reason: plan.source === "rules" ? "ai-failed" : null });
        if (plan.source === "ai") void AsyncStorage.setItem(dayPlanCacheKey(userId), dayPlanCacheValue(day, locale, provider, plan)).catch(() => undefined);
      } catch (error) {
        seen.current = null;
        setState({ status: "error", message: serverDetail(error, isArabic) });
      } finally {
        asking.current = false;
      }
    },
    [userId, locale]
  );

  // Also when coming back from the Ask screen (where the agreement is given) or Integrations.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void load(false);
    }, [enabled, load])
  );

  // The app can stay open past midnight: a new day gets a new plan.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void load(false);
    });
    return () => subscription.remove();
  }, [enabled, load]);

  const refresh = useCallback(() => (enabled ? load(true) : Promise.resolve()), [enabled, load]);
  return { state, refresh };
}
