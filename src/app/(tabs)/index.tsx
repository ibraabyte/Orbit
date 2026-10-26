import { Text } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Row, Screen, Section, Stats, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { appHref } from "@/lib/app-href";
import { buildDailyBrief, summarizeDashboard } from "@/lib/dashboard";

export default function Today() {
  const { data, loading, error, refresh } = useDashboardData();
  const summary = summarizeDashboard(data);
  const brief = buildDailyBrief(data);

  return (
    <Screen title="Today" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Stats
        items={[
          ["Tasks today", summary.todayTaskCount],
          ["Overdue", summary.overdueTaskCount],
          ["Reminders", summary.dueReminderCount],
          ["Habits", `${summary.completedHabitCount}/${summary.activeHabitCount}`],
          ["Calories", summary.todayCalories],
          ["Focus min", summary.todayFocusMinutes]
        ]}
      />
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
