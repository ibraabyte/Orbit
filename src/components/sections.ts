import type { Href } from "expo-router";
import type { IconName } from "@/components/drift";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { openTasks } from "@/lib/dashboard";
import { et } from "@/lib/exercises";
import { financeSummary } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { t } from "@/lib/i18n";

// The sections listed on More, and in the iPad sidebar.
export type Section = { key: string; href: Href; label: string; icon: IconName };

const section = (key: string, label: string, icon: IconName): Section => ({ key, href: `/${key}` as Href, label, icon });
export const manage = [section("tasks", t.tasks, "check-square")];
// Food, Exercises and WHOOP live inside Health now; they can still be pinned for one tap.
export const logs = [section("health", t.health, "activity"), section("finance", t.finance, "credit-card"), section("habits", t.habits, "repeat"), section("library", t.library, "bookmark")];
export const insideHealth = [section("food", t.food, "coffee"), section("exercises", et.exercises, "zap"), section("whoop", t.whoop, "watch")];
// Money places, investments, cards and installments live inside Finance; they can be pinned the same way.
export const insideFinance = [section("accounts", t.moneyPlaces, "briefcase"), section("investments", t.investments, "trending-up"), section("cards", t.cards, "credit-card"), section("obligations", t.obligations, "calendar")];
export const home = [section("vehicles", t.car, "truck"), section("media", t.movies, "film")];
export const system = [section("ask", t.askOrbit, "message-circle"), section("integrations", t.integrations, "link"), section("settings", t.settings, "settings")];
export const groups: [string, Section[]][] = [[t.manageDay, manage], [t.lifeLogs, logs], [t.homeServices, home], [t.system, system]];
export const pinnable = [...manage, ...logs, ...insideHealth, ...insideFinance, ...home];

/** Live counts: a number on a section means something there is waiting for you. */
export function useSectionCounts(): Record<string, number> {
  const { data } = useDashboardData();
  return {
    tasks: openTasks(data.tasks).length,
    food: foodSummary(data).neededGroceries.length,
    finance: financeSummary(data).overdueBills.length
  };
}
