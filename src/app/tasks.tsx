import { Text } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Row, Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { openTasks } from "@/lib/dashboard";
import { apiCompleteTask } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";

export default function Tasks() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const now = Date.now();
  const tasks = openTasks(data.tasks).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  return (
    <Screen title="Tasks" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {!loading && !tasks.length ? <Empty>Nothing open. Add a task above.</Empty> : null}
      {tasks.map((task) => (
        <Row
          key={task.id}
          title={task.title}
          detail={task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : null}
          tone={task.due_at && new Date(task.due_at).getTime() < now ? "danger" : task.priority === "high" ? "warning" : "neutral"}
          right="Done"
          onPress={() => act(() => apiCompleteTask(getApi(), task.id))}
        />
      ))}
    </Screen>
  );
}
