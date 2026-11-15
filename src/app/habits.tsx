import { Text, View } from "react-native";
import { Card, CheckItem, EmptyState, ProgressBar, type } from "@/components/drift";
import { Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { habitMomentum, habitProgress } from "@/lib/habits";
import { t } from "@/lib/i18n";
import { space, textSize } from "@/components/theme";

export default function Habits() {
  const { data, loading, refresh, act } = useDashboardData();

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      {!data.habits.length ? <Card>
          <EmptyState icon="repeat" example="habit read 20 min daily">{t.emptyEx}</EmptyState>
        </Card> : null}
      {data.habits.map((habit) => {
        const progress = habitProgress(habit, data.habitLogs);
        const momentum = habitMomentum(habit, data.habitLogs);
        return (
          <Card key={habit.id} style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
            <CheckItem size={44} checked={progress.done} label={`${habit.name}: ${progress.completed}/${progress.target}`} onPress={() => act(() => getApi().post("/habit-logs", { habit_id: habit.id, logged_at: new Date().toISOString() }))} />
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={type.rowTitle}>{habit.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1, maxWidth: 120 }}>
                  <ProgressBar value={progress.completed} max={progress.target} />
                </View>
                <Text style={type.tileLabel}>
                  {progress.completed}/{progress.target} · {habit.frequency === "daily" ? t.day : t.week}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={[type.stat, { fontSize: textSize.headline }]}>{momentum.currentStreak}</Text>
              <Text style={[type.tileLabel, { fontSize: textSize.caption2 }]}>🔥 {t.streak}</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
