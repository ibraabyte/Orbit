import { Text, View } from "react-native";
import { Badge, Card, CheckItem, EmptyState, Icon, ListRow, Stack, StatGrid, StatTile, type } from "@/components/drift";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Screen, ui } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiCompleteTask } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { isToday } from "@/lib/dates";
import { openTasks } from "@/lib/dashboard";

// The web's Tasks page: four tiles, an add card, and the list with lime check circles.
export default function Tasks() {
  const { data, loading, error, refresh, act } = useDashboardData();
  const now = Date.now();
  const tasks = openTasks(data.tasks).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const done = data.tasks.filter((task) => task.status === "done").length;
  const highPriority = tasks.filter((task) => task.priority === "high").length;
  const dueToday = tasks.filter((task) => task.due_at && isToday(task.due_at)).length;
  const scheduled = data.reminders.filter((reminder) => reminder.status === "scheduled").length;

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <Text style={type.shellMeta}>Create tasks, schedule reminders, and clear what is done.</Text>
      {error ? (
        <View style={[ui.tile, { flexDirection: "row", gap: 8, alignItems: "center" }]} accessibilityRole="alert">
          <Icon name="alert-circle" size={15} color={colors.urgent} />
          <Text style={[type.rowTitle, { flex: 1, color: colors.urgent }]}>{error}</Text>
        </View>
      ) : null}
      <StatGrid>
        <StatTile label="Open" value={tasks.length} hint="tasks not done yet" />
        <StatTile label="High priority" value={highPriority} hint="items to protect" tone={highPriority ? "urgent" : "neutral"} />
        <StatTile label="Today" value={dueToday} hint="due on today's calendar" />
        <StatTile label="Reminders" value={scheduled} hint="scheduled nudges" />
      </StatGrid>
      <Card title="Add task" kicker='Due date and reminder in the same line: "call mom tomorrow 9am".'>
        <QuickAddBar />
      </Card>
      <Card title="Task list" kicker={`${tasks.length} open, ${done} recently done`}>
        {tasks.length ? (
          <Stack>
            {tasks.map((task) => {
              const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < now);
              return (
                <ListRow
                  key={task.id}
                  leading={<CheckItem checked={false} label={`Mark ${task.title} done`} onPress={() => act(() => apiCompleteTask(getApi(), task.id))} />}
                  title={task.title}
                  subtitle={task.due_at ? `Due ${new Date(task.due_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "No due date"}
                  trailing={<Badge tone={overdue || task.priority === "high" ? "urgent" : "neutral"}>{overdue ? "overdue" : task.priority}</Badge>}
                />
              );
            })}
          </Stack>
        ) : (
          <EmptyState>{loading ? "Loading…" : "Nothing open. Add a task above."}</EmptyState>
        )}
      </Card>
    </Screen>
  );
}
