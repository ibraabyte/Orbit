import { QuickAddCard } from "@/components/quick-add-bar";
import { Card, CheckItem, ListRow, ProgressBar, Stack, type } from "@/components/drift";
import { Empty, Screen } from "@/components/screen";
import { Text } from "react-native";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { activeGoals, goalProgress, milestonesForGoal } from "@/lib/goals";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";

export default function Goals() {
  const { data, loading, refresh, act } = useDashboardData();
  const goals = activeGoals(data.goals);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddCard hint='Try "goal run a 10k @2026-12-31".' />
      {!goals.length ? <Empty>Add one: "goal run a 10k @2026-12-31".</Empty> : null}
      {goals.map((goal) => {
        const progress = goalProgress(goal, data.goalMilestones);
        return (
          <Card key={goal.id} title={goal.title} kicker={`${progress.percent}% done${goal.target_at ? ` · by ${goal.target_at}` : ""}`}>
            <ProgressBar value={progress.percent} />
            {goal.notes ? <Text style={type.meta}>{goal.notes}</Text> : null}
            <Stack>
              {milestonesForGoal(goal.id, data.goalMilestones).map((milestone) => (
                <ListRow
                  key={milestone.id}
                  leading={
                    <CheckItem
                      checked={Boolean(milestone.completed_at)}
                      label={milestone.title}
                      onPress={() => act(() => apiUpdate(getApi(), "/goal-milestones", milestone.id, { completed_at: milestone.completed_at ? null : new Date().toISOString() }))}
                    />
                  }
                  title={milestone.title}
                  subtitle={milestone.completed_at ? "Done" : null}
                />
              ))}
            </Stack>
          </Card>
        );
      })}
    </Screen>
  );
}
