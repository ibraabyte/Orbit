import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, ListRow, RowButton, type } from "@/components/drift";
import { ExerciseThumb } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { Button } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { isArabic } from "@/lib/i18n";
import { label } from "@/lib/exercises";
import { alternativeLabel, dayLabel, planApi, pt, recoveryLine, setsChange, setsText, type PlannedDay, type PlannedExercise } from "@/lib/plan";
import { restText } from "@/lib/training";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * One planned day: its exercises with today's sets, a swap on each, and Start / Not going today. On today's card the
 * recovery line says what WHOOP changed. `onChange` reloads the screen after a move or a swap.
 */
export function PlanDayCard({ day, today, onChange }: { day: PlannedDay; today: string; onChange: (day?: PlannedDay) => void }) {
  const { sheet, toast } = useOverlays();
  const [busy, setBusy] = useState(false);
  const isToday = day.date === today;
  const open = day.status === "planned" && day.date >= today;
  const kept = day.exercises.filter((entry) => !day.dropped.includes(entry.id));
  const dropped = day.exercises.filter((entry) => day.dropped.includes(entry.id));

  const run = async <T,>(work: () => Promise<T>) => {
    if (busy) return null;
    setBusy(true);
    try {
      return await work();
    } catch (error) {
      toast(errorText(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (day.workout_id) return router.push({ pathname: "/workout", params: { id: day.workout_id } });
    const session = await run(() => planApi.start(getApi(), day));
    if (session) {
      onChange();
      router.push({ pathname: "/workout", params: { id: session.id } });
    }
  };

  const move = async () => {
    const moved = await run(() => planApi.move(getApi(), day.id));
    if (moved) {
      toast(pt.moved(dayLabel(moved.date, today)));
      onChange();
    }
  };

  const swap = async (entry: PlannedExercise) => {
    const options = await run(() => planApi.alternatives(getApi(), entry.id));
    if (!options) return;
    if (!options.length) return toast(pt.noAlternatives);
    sheet({
      title: `${pt.swapTitle} ${entry.name}`,
      detail: pt.swapDetail,
      options: options.map((option) => ({
        label: alternativeLabel(option),
        run: () =>
          void run(() => planApi.swap(getApi(), entry.id, option.id)).then((next) => {
            if (!next) return;
            toast(pt.swapped);
            onChange(next);
          })
      }))
    });
  };

  const title = `${dayLabel(day.date, today)} · ${pt.kinds[day.kind]}`;
  const statusBadge =
    day.status === "done" ? <Badge tone="accent" glyph="✓">{pt.status.done}</Badge> : day.status === "started" ? <Badge tone="accent" glyph="●">{pt.status.started}</Badge> : day.status === "missed" ? <Badge tone="urgent" glyph="!">{pt.status.missed}</Badge> : undefined;

  return (
    <Card title={title} action={statusBadge}>
      {isToday && day.status !== "done" ? (
        <View style={[styles.recovery, day.adjustment === "rest" && { borderColor: colors.urgent }]}>
          <Text style={type.rowSubtitle}>{recoveryLine(day)}</Text>
        </View>
      ) : null}
      {!day.exercises.length ? <EmptyState icon="activity" action={false}>{pt.empty}</EmptyState> : null}
      {kept.map((entry, index) => {
        const change = setsChange(entry);
        return (
          <ListRow
            key={entry.id}
            first={index === 0}
            leading={<ExerciseThumb uri={entry.image_url} size={40} />}
            title={entry.name}
            subtitle={[label(entry.muscle), restText(entry.rest_seconds)].join(" · ")}
            badges={
              <>
                <Badge tone={change ? "accent" : "neutral"}>{change ? `${setsText(entry)} (${change})` : setsText(entry)}</Badge>
                {entry.swapped_from ? <Badge glyph="⇄">{pt.swappedBadge}</Badge> : null}
              </>
            }
            onPress={entry.exercise_id ? () => router.push(`/exercises/${encodeURIComponent(entry.exercise_id ?? "")}`) : undefined}
            trailing={open ? <RowButton outline icon="repeat" label={pt.swap} disabled={busy} onPress={() => void swap(entry)} /> : undefined}
          />
        );
      })}
      {dropped.length ? (
        <Text style={[type.rowSubtitle, styles.dropped]}>
          {pt.droppedToday}: {dropped.map((entry) => entry.name).join(isArabic ? "، " : ", ")}
        </Text>
      ) : null}
      {
        <View style={styles.actions}>
          {day.status === "started" ? <Button variant="primary" title={pt.resume} onPress={() => void start()} /> : null}
          {day.status === "done" && day.workout_id ? <Button variant="outline" title={pt.status.done} onPress={() => void start()} /> : null}
          {open && isToday ? (
            day.adjustment === "rest" ? (
              <>
                <Button variant="primary" title={pt.notGoing} disabled={busy} onPress={() => void move()} />
                <Button variant="outline" title={pt.startLight} disabled={busy} onPress={() => void start()} />
              </>
            ) : (
              <>
                <Button variant="primary" title={pt.start} disabled={busy || !day.exercises.length} onPress={() => void start()} />
                <Button variant="outline" title={pt.notGoing} disabled={busy} onPress={() => void move()} />
              </>
            )
          ) : null}
          {open && !isToday ? (
            <>
              <Button variant="outline" title={pt.notGoingDay} disabled={busy} onPress={() => void move()} />
              <Button variant="dark" title={pt.start} disabled={busy || !day.exercises.length} onPress={() => void start()} />
            </>
          ) : null}
        </View>
      }
    </Card>
  );
}

const styles = StyleSheet.create({
  recovery: { borderWidth: 1, borderColor: colors.hairline, borderRadius: 12, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  dropped: { paddingTop: 8, opacity: 0.8 },
  actions: { gap: 8, paddingTop: 12 }
});
