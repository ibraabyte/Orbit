import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { hiddenSections, withSection, type SectionKey } from "@/lib/app-sections";
import { getApi } from "@/lib/backend";
import { t } from "@/lib/i18n";

/** Which sections are on, and a switch for each. The change shows at once and is saved on the profile for every device. */
export function useSections() {
  const { data, updateLocal, refresh } = useDashboardData();
  const saved = data.profile?.hidden_sections;
  const hidden = useMemo(() => hiddenSections(data.profile), [data.profile]);

  const setOn = useCallback(
    async (key: SectionKey, on: boolean) => {
      const before = saved ?? [];
      const next = withSection(before, key, on);
      const put = (list: string[]) => updateLocal((current) => (current.profile ? { ...current, profile: { ...current.profile, hidden_sections: list } } : current));
      put(next);
      try {
        await getApi().patch("/profile", { hidden_sections: next });
        void refresh();
      } catch (error) {
        put(before);
        Alert.alert(t.changeFailed, error instanceof Error ? error.message : t.tryAgain);
      }
    },
    [saved, updateLocal, refresh]
  );

  return { hidden, saved: saved ?? [], on: (key: SectionKey) => !hidden.has(key), setOn };
}
