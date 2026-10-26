import { Text, View } from "react-native";
import { QuickAddBar } from "@/components/quick-add-bar";
import { Empty, Row, Screen, Section, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { activeGoals, goalProgress, milestonesForGoal } from "@/lib/goals";
import { getSupabase } from "@/lib/supabase";

export default function Goals() {
  const { userId, data, loading, refresh, act } = useDashboardData();
  const goals = activeGoals(data.goals);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <QuickAddBar />
      {!goals.length ? <Empty>Add one: "goal run a 10k @2026-12-31".</Empty> : null}
      {goals.map((goal) => {
        const progress = goalProgress(goal, data.goalMilestones);
        return (
          <Section key={goal.id} title={`${progress.percent}%${goal.target_at ? ` · by ${goal.target_at}` : ""}`}>
            <View style={ui.card}>
              <Text style={[ui.body, { fontWeight: "600" }]}>{goal.title}</Text>
              {goal.notes ? <Text style={ui.muted}>{goal.notes}</Text> : null}
            </View>
            {milestonesForGoal(goal.id, data.goalMilestones).map((milestone) => (
              <Row
                key={milestone.id}
                title={milestone.title}
                tone={milestone.completed_at ? "success" : "neutral"}
                right={milestone.completed_at ? "Done" : "Mark done"}
                onPress={() => act(() => getSupabase().from("goal_milestones").update({ completed_at: milestone.completed_at ? null : new Date().toISOString() }).eq("id", milestone.id).eq("user_id", userId))}
              />
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}
