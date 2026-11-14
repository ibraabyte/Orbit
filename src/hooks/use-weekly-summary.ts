import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { loadAskConsent } from "@/hooks/use-ask-consent";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { activeProvider, briefStep, serverDetail } from "@/lib/ask";
import { getApi } from "@/lib/backend";
import { isArabic } from "@/lib/i18n";
import { featureAi } from "@/lib/feature-models";
import { aiQuery, integrationsApi } from "@/lib/integrations";
import { isNoAiError } from "@/lib/morning-brief";
import { parseWeekCache, weekCacheKey, weekCacheValue, weekEnd, type WeekFacts, type WeekReply } from "@/lib/weekly-summary";

// facts: the week's numbers, which never go to the AI, so they show in every state that has them.
export type WeekState =
  | { status: "loading"; facts: WeekFacts | null }
  | { status: "ready"; reply: WeekReply }
  | { status: "no-ai"; facts: WeekFacts | null }
  | { status: "consent"; facts: WeekFacts | null }
  | { status: "error"; message: string; facts: WeekFacts | null };

// The latest week's summary. Written once per week through the person's own AI and kept on the phone; only the refresh
// button (or pull-to-refresh) asks again. Sending the week needs the same agreement as Ask Orbit and the morning brief:
// without it only the numbers are loaded, and nothing goes to the AI.
export function useWeeklySummary(enabled = true) {
  const { userId } = useDashboardData();
  const [state, setState] = useState<WeekState>({ status: "loading", facts: null });
  const asking = useRef(false);
  const locale = isArabic ? "ar" : "en";

  const load = useCallback(
    async (force: boolean) => {
      if (asking.current) return;
      asking.current = true;
      const end = weekEnd(new Date());
      const body = { end, locale };
      let facts: WeekFacts | null = null;
      const drop = () => void AsyncStorage.removeItem(weekCacheKey(userId)).catch(() => undefined);
      try {
        const accepted = await loadAskConsent(userId);
        if (accepted !== null && !force) {
          const cached = parseWeekCache(await AsyncStorage.getItem(weekCacheKey(userId)).catch(() => null), end, locale, accepted);
          // A copy saved for one AI is only shown while that AI is the one agreed to (the cache records it).
          if (cached) return setState({ status: "ready", reply: cached });
        }
        setState((now) => ({ status: "loading", facts: now.status === "ready" ? now.reply.facts : now.facts }));
        facts = await getApi().post<WeekFacts>("/assistant/week/facts", body);
        // The AI set for this in Integrations, else the default; asked for by name so the agreement matches it.
        const overview = await integrationsApi.overview(getApi());
        const picked = featureAi(overview, "week");
        const provider = activeProvider(overview, picked);
        const step = briefStep(accepted, provider);
        if (step !== "ask" || provider === null) {
          drop();
          return setState(step === "consent" ? { status: "consent", facts } : { status: "no-ai", facts });
        }
        const reply = await getApi().post<WeekReply>(`/assistant/week${aiQuery(picked)}`, body);
        // Withdrawn or changed while the AI was writing: the text is dropped, not shown or saved.
        if ((await loadAskConsent(userId)) !== accepted) {
          drop();
          return setState({ status: "consent", facts });
        }
        setState({ status: "ready", reply });
        void AsyncStorage.setItem(weekCacheKey(userId), weekCacheValue(end, locale, provider, reply)).catch(() => undefined);
      } catch (error) {
        setState(isNoAiError(error) ? { status: "no-ai", facts } : { status: "error", message: serverDetail(error, isArabic), facts });
      } finally {
        asking.current = false;
      }
    },
    [userId, locale]
  );

  // Coming back from the Ask screen (where the agreement is given) or Integrations re-checks; a saved copy costs nothing.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void load(false);
    }, [enabled, load])
  );

  const refresh = useCallback(() => (enabled ? load(true) : Promise.resolve()), [enabled, load]);
  return { state, refresh };
}
