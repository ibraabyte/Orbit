import { Card, EmptyState, StatGrid, StatTile, type } from "@/components/drift";
import { Text } from "react-native";
import { openCapture, Screen } from "@/components/screen";
import { TaskRow } from "@/components/task-row";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { openTasks } from "@/lib/dashboard";
import { isToday } from "@/lib/dates";
import { t } from "@/lib/i18n";

export default function Tasks() {
  const { data, loading, refresh } = useDashboardData();
  const tasks = openTasks(data.tasks).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const high = tasks.filter((task) => task.priority === "high").length;
  const today = tasks.filter((task) => isToday(task.due_at)).length;
  const scheduled = data.reminders.filter((reminder) => reminder.status === "scheduled").length;

  return (
    <Screen stackAction={{ label: t.capture, onPress: () => openCapture() }} refreshing={loading} onRefresh={refresh}>
      <StatGrid>
        {[
          <StatTile key="open" label={t.openTasks} value={tasks.length} />,
          <StatTile key="high" label={t.highPriority} value={high} color={colors.accentDeep} />,
          <StatTile key="today" label={t.dueToday} value={today} />,
          <StatTile key="scheduled" label={t.scheduled} value={scheduled} />
        ]}
      </StatGrid>
      <Card>
        <Text style={type.tileLabel}>{t.sortedByDue}</Text>
        {tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} showPriority />) : <EmptyState icon="circle" example="pay rent fri 5pm !high">{t.emptyEx}</EmptyState>}
      </Card>
    </Screen>
  );
}
