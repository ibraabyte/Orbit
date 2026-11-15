import { Text } from "react-native";
import { Card, type } from "@/components/drift";
import { PlanFailed, PlanHeader, PlanRow, reasonLink } from "@/components/day-plan";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useDayPlan } from "@/hooks/use-day-plan";
import { useNow } from "@/hooks/use-now";
import { usePrayerTimes } from "@/hooks/use-prayer-times";
import { apiCompleteTask } from "@/lib/api-actions";
import { getApi } from "@/lib/backend";
import { dp } from "@/lib/day-plan";
import { t } from "@/lib/i18n";

// The whole day's plan: energy and the AI's note on top, then every block from the time it was made to the evening.
// Opened from the Today card and from the assistant. "Plan again" lays out the rest of the day from now.
export default function DayPlanScreen() {
  const { data, act } = useDashboardData();
  const { today: prayers } = usePrayerTimes();
  const { state, refresh } = useDayPlan(prayers);
  const { toast } = useOverlays();
  const now = useNow();
  const done = (taskId: string) => void act(() => apiCompleteTask(getApi(), taskId)).then(() => toast(t.done));
  const busy = state.status === "loading";

  return (
    <Screen title={dp.title} refreshing={false} onRefresh={() => void refresh()}>
      {state.status === "loading" ? <Loading /> : null}
      {state.status === "error" ? <PlanFailed message={state.message} retry={() => void refresh()} /> : null}
      {state.status === "ready" ? (
        <>
          <Card title={dp.short} action={reasonLink(state) ?? undefined}>
            <PlanHeader plan={state.plan} reason={state.reason} />
            {state.plan.blocks.map((block, index) => (
              <PlanRow key={`${block.start}-${block.kind}-${index}`} block={block} now={now} tasks={data.tasks} first={index === 0} onDone={done} />
            ))}
            {!state.plan.blocks.length ? <Text style={type.rowSubtitle}>{dp.empty}</Text> : null}
            {state.plan.left_out ? <Text style={[type.rowSubtitle, { paddingTop: 8 }]}>{dp.leftOut(state.plan.left_out)}</Text> : null}
          </Card>
          <Button variant="outline" title={dp.rebuild} disabled={busy} onPress={() => void refresh()} />
          <Text style={type.rowSubtitle}>{dp.hint}</Text>
        </>
      ) : null}
    </Screen>
  );
}
