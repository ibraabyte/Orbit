import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Row, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { habitMomentum, habitProgress } from "@/lib/habits";
import { getSupabase } from "@/lib/supabase";

export default function Habits() {
  const { userId, data, loading, refresh, act } = useDashboardData();

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {!data.habits.length ? <Empty>Add one: "habit read 20 min daily".</Empty> : null}
      {data.habits.map((habit) => {
        const progress = habitProgress(habit, data.habitLogs);
        const momentum = habitMomentum(habit, data.habitLogs);
        return (
          <Row
            key={habit.id}
            title={habit.name}
            detail={`${progress.completed}/${progress.target} this ${momentum.unit} · ${momentum.currentStreak} ${momentum.unit} streak`}
            tone={progress.done ? "success" : "neutral"}
            right={progress.done ? "Done" : "Check in"}
            onPress={() => act(() => getSupabase().from("habit_logs").insert({ user_id: userId, habit_id: habit.id, logged_at: new Date().toISOString(), note: null }))}
          />
        );
      })}
    </Screen>
  );
}
