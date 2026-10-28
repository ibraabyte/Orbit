import { Text } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Row, Screen, Section, Stats, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { appHref } from "@/lib/app-href";
import { buildDailyBrief, summarizeDashboard } from "@/lib/dashboard";

export default function Today() {
  const { data, loading, error, refresh } = useDashboardData();
  const summary = summarizeDashboard(data);
  const brief = buildDailyBrief(data);
  const { next: prayer } = usePrayerTimes();
  // Only numbers that say something; a wall of zeros is noise.
  const stats = (
    [
      ["Tasks today", summary.todayTaskCount],
      ["Overdue", summary.overdueTaskCount],
      ["Reminders", summary.dueReminderCount],
      ["Habits", summary.activeHabitCount ? `${summary.completedHabitCount}/${summary.activeHabitCount}` : 0],
      ["Calories", summary.todayCalories],
      ["Focus min", summary.todayFocusMinutes]
    ] as const
  ).filter(([, value]) => value !== 0);

  return (
    <Screen title="Today" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {prayer ? (
        <Row title={`صلاة ${prayer.label}`} right={prayer.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} />
      ) : null}
      {stats.length ? <Stats items={stats} /> : null}
      {brief.length ? (
        <Section title="Next up">
          {brief.map((item) => (
            <Row key={item.id} title={item.title} detail={item.detail} tone={item.tone} href={appHref(item.href)} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}
