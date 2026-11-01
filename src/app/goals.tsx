import { Text, View } from "react-native";
import { Card, CheckItem, EmptyState, RingGauge, type } from "@/components/drift";
import { Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { apiUpdate } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { activeGoals, goalProgress, milestonesForGoal } from "@/lib/goals";
import { formatDate, t } from "@/lib/i18n";

export default function Goals() {
  const { data, loading, refresh, act } = useDashboardData();
  const goals = activeGoals(data.goals);

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      {!goals.length ? <EmptyState example="goal run a 10k @2026-12-31">{t.emptyEx}</EmptyState> : null}
      {goals.map((goal) => {
        const progress = goalProgress(goal, data.goalMilestones);
        const detail = [goal.target_at ? `${t.target} ${formatDate(`${goal.target_at.slice(0, 10)}T12:00:00`, { day: "numeric", month: "short", year: "numeric" })}` : null, goal.notes].filter(Boolean).join(" · ");
        return (
          <Card key={goal.id} style={{ gap: 10, paddingVertical: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <RingGauge value={progress.percent / 100} size={56} thickness={7} label={`${progress.percent}%`} color={colors.ink} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.title, { fontSize: 16 }]}>{goal.title}</Text>
                {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
              </View>
            </View>
            <View>
              {milestonesForGoal(goal.id, data.goalMilestones).map((milestone) => {
                const done = Boolean(milestone.completed_at);
                return (
                  <View key={milestone.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.surfaceInset }}>
                    <CheckItem size={24} checked={done} label={milestone.title} onPress={() => act(() => apiUpdate(getApi(), "/goal-milestones", milestone.id, { completed_at: done ? null : new Date().toISOString() }))} />
                    <Text style={[type.body, { flex: 1 }, done && { textDecorationLine: "line-through", color: colors.inkMuted }]}>{milestone.title}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
