import { QuickAddCard } from "@/components/quick-add-bar";
import { Card, CheckItem, EmptyState, ListRow, Stack } from "@/components/drift";
import { Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { habitMomentum, habitProgress } from "@/lib/habits";
import { getApi } from "@/lib/backend";

export default function Habits() {
  const { data, loading, refresh, act } = useDashboardData();

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "habit read 20 min daily".' />
      <Card title="Check-ins" kicker="Tap the circle to log a check-in.">
        {!data.habits.length ? <EmptyState>No habits yet.</EmptyState> : null}
        <Stack>
          {data.habits.map((habit) => {
            const progress = habitProgress(habit, data.habitLogs);
            const momentum = habitMomentum(habit, data.habitLogs);
            return (
              <ListRow
                key={habit.id}
                leading={<CheckItem checked={progress.done} label={`Check in ${habit.name}`} onPress={() => act(() => getApi().post("/habit-logs", { habit_id: habit.id, logged_at: new Date().toISOString() }))} />}
                title={habit.name}
                subtitle={`${progress.completed}/${progress.target} this ${momentum.unit} · ${momentum.currentStreak} ${momentum.unit} streak`}
              />
            );
          })}
        </Stack>
      </Card>
    </Screen>
  );
}
