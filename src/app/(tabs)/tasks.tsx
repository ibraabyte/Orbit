import * as Haptics from "expo-haptics";
import { Alert, Pressable, Text, View } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { openTasks } from "@/lib/dashboard";
import { getSupabase } from "@/lib/supabase";
import { completeTaskWithReminders } from "@/lib/task-completion";
import type { Task } from "@/lib/types";

export default function Tasks() {
  const { data, loading, error, refresh } = useDashboardData();
  const tasks = openTasks(data.tasks).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  async function complete(task: Task) {
    try {
      await completeTaskWithReminders(getSupabase(), task, { tags: data.tags, taggings: data.taggings });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } catch (completeError) {
      Alert.alert("Could not complete", completeError instanceof Error ? completeError.message : "Try again.");
    }
  }

  return (
    <Screen title="Tasks" refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {!loading && !tasks.length ? <Text style={ui.muted}>Nothing open. Add a task above.</Text> : null}
      {tasks.map((task) => (
        <Pressable key={task.id} onPress={() => complete(task)} accessibilityRole="button" accessibilityLabel={`Complete ${task.title}`}>
          <View style={[ui.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: task.priority === "high" ? "#c0392b" : "#c7c7cc" }} />
            <View style={{ flex: 1 }}>
              <Text style={ui.body}>{task.title}</Text>
              {task.due_at ? <Text style={ui.muted}>Due {new Date(task.due_at).toLocaleString()}</Text> : null}
            </View>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
