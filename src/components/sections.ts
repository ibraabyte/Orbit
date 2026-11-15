import type { Href } from "expo-router";
import type { IconName } from "@/components/drift";
import { useMemo } from "react";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSections } from "@/hooks/use-sections";
import { pathHidden } from "@/lib/app-sections";
import { openTasks, summarizeDashboard } from "@/lib/dashboard";
import { et } from "@/lib/exercises";
import { financeSummary, formatMoney } from "@/lib/finance";
import { foodSummary } from "@/lib/food";
import { formatNumber, isArabic, t } from "@/lib/i18n";
import { dosesOnDay, rx } from "@/lib/medications";
import { px } from "@/lib/phone-calls";

// The sections listed on More, and in the iPad sidebar.
export type Section = { key: string; href: Href; label: string; icon: IconName };

const section = (key: string, label: string, icon: IconName): Section => ({ key, href: `/${key}` as Href, label, icon });
export const manage = [section("tasks", t.tasks, "check-square"), section("phone-calls", px.calls, "phone-outgoing")];
// Food, Exercises and WHOOP live inside Health now; they can still be pinned for one tap.
export const logs = [section("health", t.health, "activity"), section("finance", t.finance, "credit-card"), section("habits", t.habits, "repeat"), section("library", t.library, "bookmark")];
export const insideHealth = [section("food", t.food, "coffee"), section("exercises", et.exercises, "zap"), section("whoop", t.whoop, "watch"), section("medications", rx.medications, "plus-square")];
// Money places, investments, cards and installments live inside Finance; they can be pinned the same way.
export const insideFinance = [section("accounts", t.moneyPlaces, "briefcase"), section("investments", t.investments, "trending-up"), section("cards", t.cards, "credit-card"), section("obligations", t.obligations, "calendar")];
export const home = [section("vehicles", t.car, "truck"), section("media", t.movies, "film")];
const ask = section("ask", t.askOrbit, "message-circle");
export const system = [section("integrations", t.integrations, "link"), section("settings", t.settings, "settings")];
// Ask Orbit leads: it is the assistant, not a setting. Tasks sit with the logs rather than in a group of one.
export const groups: [string, Section[]][] = [[t.manageDay, [ask, ...manage, ...logs]], [t.homeServices, home], [t.system, system]];
export const pinnable = [...manage, ...logs, ...insideHealth, ...insideFinance, ...home];

/** More's groups and pins without the sections switched off in Settings (a group left empty goes too). */
export function useVisibleSections() {
  const { hidden } = useSections();
  return useMemo(() => {
    const shown = (items: Section[]) => items.filter((item) => !pathHidden(`/${item.key}`, hidden));
    return {
      groups: groups.map(([label, items]) => [label, shown(items)] as [string, Section[]]).filter(([, items]) => items.length > 0),
      pinnable: shown(pinnable)
    };
  }, [hidden]);
}

/** Live counts: a number on a section means something there is waiting for you. */
export function useSectionCounts(): Record<string, number> {
  const { data } = useDashboardData();
  return {
    tasks: openTasks(data.tasks).length,
    food: foodSummary(data).neededGroceries.length,
    finance: financeSummary(data).overdueBills.length,
    // Doses due now or missed today, still unanswered.
    medications: dosesOnDay(data.medications, data.medicationDoses, new Date()).filter((entry) => entry.state === "due" || entry.state === "missed").length
  };
}

// The live line on More's cards. Only what the dashboard already holds; a section with nothing to say gets no line.
const en = {
  overdue: "overdue", open: "open", clear: "All clear", nothingToday: "Nothing logged today", nothingSpent: "Nothing spent today",
  workout: (n: string) => `${n} min workout today`, kcal: (n: string) => `${n} kcal today`, spent: (n: string) => `Spent ${n} today`,
  billsLate: (n: string) => `${n} bills overdue`, habits: (done: string, all: string) => `${done} of ${all} done today`,
  toBuy: (n: string) => `${n} to buy`, doses: (n: string) => `${n} doses due`,
  searchPh: "Find a section or ask Orbit", askThis: (q: string) => `Ask Orbit: “${q}”`, today: (n: string) => `${n} today`,
  places: (n: string) => `${n} places`, holdings: (n: string) => `${n} holdings`, cardsN: (n: string) => `${n} cards`, activeN: (n: string) => `${n} active`,
  workoutsWeek: (n: string) => `${n} workouts this week`, medsN: (n: string) => `${n} medicines`, mealsToday: (n: string) => `${n} meals today`,
  bodyGroup: "Health & body", moneyGroup: "Money", lifeGroup: "Life & home", searchAsk: "Ask Orbit, or find a section",
  spentToday: "spent today", minLeft: (n: string) => `${n} min left this week`, targetMet: "Weekly target met", thisWeek: "this week", noMatch: "No section by that name"
};
const ar: typeof en = {
  overdue: "متأخرة", open: "مفتوحة", clear: "كل شي تمام", nothingToday: "ما سجلت شي اليوم", nothingSpent: "ما صرفت شي اليوم",
  workout: (n) => `${n} دقيقة تمرين اليوم`, kcal: (n) => `${n} سعرة اليوم`, spent: (n) => `صرفت ${n} اليوم`,
  billsLate: (n) => `${n} فواتير متأخرة`, habits: (done, all) => `${done} من ${all} اليوم`,
  toBuy: (n) => `${n} للشراء`, doses: (n) => `${n} جرعات مستحقة`,
  searchPh: "ابحث عن قسم أو اسأل Orbit", askThis: (q) => `اسأل Orbit: «${q}»`, today: (n) => `${n} اليوم`,
  places: (n) => `${n} أماكن`, holdings: (n) => `${n} استثمارات`, cardsN: (n) => `${n} بطاقات`, activeN: (n) => `${n} نشطة`,
  workoutsWeek: (n) => `${n} تمارين هالأسبوع`, medsN: (n) => `${n} أدوية`, mealsToday: (n) => `${n} وجبات اليوم`,
  bodyGroup: "الصحة والجسم", moneyGroup: "الفلوس", lifeGroup: "الحياة والبيت", searchAsk: "اسأل Orbit أو ابحث عن قسم",
  spentToday: "صرفت اليوم", minLeft: (n) => `باقي ${n} دقيقة هالأسبوع`, targetMet: "خلصت هدف الأسبوع", thisWeek: "هالأسبوع", noMatch: "ما فيه قسم بهالاسم"
};
export const mt = isArabic ? ar : en;
const st = mt;

export type SectionStatus = { value?: string; caption: string; alert?: boolean };

export function useSectionStatus(): Record<string, SectionStatus | undefined> {
  const { data } = useDashboardData();
  return useMemo(() => {
    const now = new Date();
    const summary = summarizeDashboard(data, now);
    const finance = financeSummary(data);
    const currency = data.expenses[0]?.currency ?? data.bills[0]?.currency ?? "SAR";
    const groceries = foodSummary(data).neededGroceries.length;
    const doses = dosesOnDay(data.medications, data.medicationDoses, now).filter((entry) => entry.state === "due" || entry.state === "missed").length;
    const n = formatNumber;
    return {
      tasks: summary.overdueTaskCount
        ? { value: n(summary.overdueTaskCount), caption: st.overdue, alert: true }
        : summary.openTaskCount
          ? { value: n(summary.openTaskCount), caption: st.open }
          : { caption: st.clear },
      health: summary.todayWorkoutMinutes
        ? { caption: st.workout(n(summary.todayWorkoutMinutes)) }
        : summary.todayCalories
          ? { caption: st.kcal(n(summary.todayCalories)) }
          : { caption: st.nothingToday },
      finance: finance.overdueBills.length
        ? { caption: st.billsLate(n(finance.overdueBills.length)), alert: true }
        : { caption: summary.todaySpending ? st.spent(formatMoney(summary.todaySpending, currency)) : st.nothingSpent },
      habits: summary.activeHabitCount ? { caption: st.habits(n(summary.completedHabitCount), n(summary.activeHabitCount)) } : undefined,
      food: groceries ? { caption: st.toBuy(n(groceries)) } : summary.todayCalories ? { caption: st.kcal(n(summary.todayCalories)) } : undefined,
      medications: doses ? { caption: st.doses(n(doses)), alert: true } : data.medications.length ? { caption: st.medsN(n(data.medications.length)) } : undefined,
      exercises: { caption: st.workoutsWeek(n(data.workouts.filter((workout) => now.getTime() - new Date(workout.logged_at).getTime() < 7 * 86_400_000).length)) },
      accounts: data.moneyAccounts.length ? { caption: st.places(n(data.moneyAccounts.length)) } : undefined,
      investments: data.investments.length ? { caption: st.holdings(n(data.investments.length)) } : undefined,
      cards: data.cards.length ? { caption: st.cardsN(n(data.cards.length)) } : undefined,
      obligations: data.obligations.length ? { caption: st.activeN(n(data.obligations.length)) } : undefined
    };
  }, [data]);
}
