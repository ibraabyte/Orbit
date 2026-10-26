import { Text, View } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { buildDailyBrief, summarizeDashboard } from "@/lib/dashboard";

export default function Today() {
  const { data, loading, error, refresh } = useDashboardData();
  const summary = summarizeDashboard(data);
  const brief = buildDailyBrief(data);

  const stats = [
    ["Tasks today", summary.todayTaskCount],
    ["Overdue", summary.overdueTaskCount],
    ["Reminders due", summary.dueReminderCount],
    ["Habits", `${summary.completedHabitCount}/${summary.activeHabitCount}`],
    ["Calories", summary.todayCalories],
    ["Focus min", summary.todayFocusMinutes]
  ] as const;

  return (
    <Screen title="Today" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {stats.map(([label, value]) => (
          <View key={label} style={[ui.card, { width: "31%" }]}>
            <Text style={ui.label}>{label}</Text>
            <Text style={[ui.body, { fontSize: 22, fontWeight: "600" }]}>{value}</Text>
          </View>
        ))}
      </View>
      {brief.map((item) => (
        <View key={item.id} style={ui.card}>
          <Text style={[ui.body, { fontWeight: "600" }]}>{item.title}</Text>
          <Text style={ui.muted}>{item.detail}</Text>
        </View>
      ))}
    </Screen>
  );
}
