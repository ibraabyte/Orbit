import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Card, CardLink, Icon, type IconName, RowButton, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { colors, fonts } from "@/components/theme";
import type { DayPlanState } from "@/hooks/use-day-plan";
import { blockRange, blockTitle, dp, energyLine, isNow, upcomingBlocks, type BlockKind, type DayBlock, type DayPlan } from "@/lib/day-plan";
import { t } from "@/lib/i18n";
import type { Task } from "@/lib/types";

const icons: Record<BlockKind, IconName> = { prayer: "moon", reminder: "bell", appointment: "calendar", task: "check-square", workout: "activity", break: "coffee" };

// A task's block is still to do while the task is open; one finished (here or elsewhere) shows ticked.
const taskOpen = (block: DayBlock, tasks: Task[]) => (block.task_id ? tasks.some((task) => task.id === block.task_id && task.status === "open") : false);

/** One line of the plan: the time range (left to right in every language), an icon, the title and its kind. */
export function PlanRow({ block, now, tasks, first, onDone }: { block: DayBlock; now: Date; tasks: Task[]; first?: boolean; onDone?: (taskId: string) => void }) {
  const current = isNow(block, now);
  const finished = block.task_id !== null && !taskOpen(block, tasks);
  const open = block.task_id ? () => router.push(`/task/${block.task_id}`) : undefined;
  return (
    <View style={[styles.row, first && { borderTopWidth: 0 }]} accessible accessibilityLabel={`${dp.kinds[block.kind]}: ${blockTitle(block)}, ${blockRange(block)}`}>
      <Text style={[styles.time, current && { color: colors.accent }]}>{blockRange(block)}</Text>
      <View style={[styles.mark, current && styles.markNow]}>
        <Icon name={finished ? "check" : icons[block.kind]} size={14} color={current ? colors.accent : colors.inkMuted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.rowTitle, finished && styles.finished]} numberOfLines={2} onPress={open}>
          {blockTitle(block)}
        </Text>
        <Text style={type.rowSubtitle}>{current ? `${dp.now} · ${dp.kinds[block.kind]}` : dp.kinds[block.kind]}</Text>
      </View>
      {block.task_id && !finished && onDone ? <RowButton label={dp.done} onPress={() => onDone(block.task_id!)} /> : null}
    </View>
  );
}

/** Energy, the AI's note, and why simple rules were used, above the timeline. */
export function PlanHeader({ plan, reason }: { plan: DayPlan; reason: Extract<DayPlanState, { status: "ready" }>["reason"] }) {
  const energy = energyLine(plan.energy);
  const why = reason === "no-ai" ? dp.noAi : reason === "consent" ? dp.consent : reason === "ai-failed" ? dp.aiFailed : plan.source === "rules" ? dp.rules : null;
  return (
    <View style={{ gap: 6, paddingBottom: 8 }}>
      {energy ? <Text style={styles.energy}>{energy}</Text> : <Text style={type.rowSubtitle}>{dp.noWhoop}</Text>}
      {plan.rest_day ? <Text style={type.rowSubtitle}>{dp.restDay}</Text> : null}
      {plan.note ? <Text style={type.body}>{plan.note}</Text> : null}
      {why ? <Text style={type.rowSubtitle}>{why}</Text> : null}
    </View>
  );
}

const reasonLink = (state: DayPlanState) =>
  state.status === "ready" && state.reason === "no-ai" ? <CardLink href="/integrations" label={t.morningBriefConnect} /> : state.status === "ready" && state.reason === "consent" ? <CardLink href="/ask" label={t.morningBriefAllow} /> : null;

/** Today's card: what is happening now and the next few blocks. */
export function DayPlanCard({ state, now, tasks, retry, onDone }: { state: DayPlanState; now: Date; tasks: Task[]; retry: () => void; onDone: (taskId: string) => void }) {
  const next = state.status === "ready" ? upcomingBlocks(state.plan, now, 4) : [];
  return (
    <Card title={dp.title} action={reasonLink(state) ?? <CardLink href="/day-plan" label={dp.open} />}>
      {state.status === "loading" ? (
        <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
          {dp.building}
        </Text>
      ) : null}
      {state.status === "error" ? <PlanFailed message={state.message} retry={retry} /> : null}
      {state.status === "ready" ? (
        <>
          <PlanHeader plan={state.plan} reason={state.reason} />
          {next.map((block, index) => (
            // Only the first task on the card gets a Done button, like Next up; the full plan has one on each.
            <PlanRow key={`${block.start}-${block.kind}-${index}`} block={block} now={now} tasks={tasks} first={index === 0} onDone={block === next.find((item) => item.task_id) ? onDone : undefined} />
          ))}
          {!next.length ? <Text style={type.rowSubtitle}>{state.plan.blocks.length ? dp.over : dp.empty}</Text> : null}
        </>
      ) : null}
    </Card>
  );
}

export function PlanFailed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
        {`${dp.failed} ${message}`.trim()}
      </Text>
      <Button variant="outline" title={dp.retry} onPress={retry} />
    </View>
  );
}

export { reasonLink };

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  time: { width: 82, fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMuted, writingDirection: "ltr" },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceInset },
  markNow: { backgroundColor: colors.accentTint },
  finished: { color: colors.inkMuted, textDecorationLine: "line-through" },
  energy: { fontFamily: fonts.medium, fontSize: 13, color: colors.accent }
});
