import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge, Card, CheckItem, EmptyState, Icon, MoreButton, RowButton, StatGrid, StatTile, type } from "@/components/drift";
import { ExerciseThumb } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { loadNotificationPrefs } from "@/hooks/use-notification-prefs";
import { getApi } from "@/lib/backend";
import { digits, formatDate, t } from "@/lib/i18n";
import { notificationAllowed } from "@/lib/notification-prefs";
import {
  clock,
  elapsedSeconds,
  newRecords,
  parseNumber,
  REST_CHOICES,
  restLeft,
  restText,
  sessionLine,
  sessionTotals,
  setText,
  shortSet,
  trainingApi,
  tt,
  volumeText,
  amountText,
  type ExerciseHistory,
  type Session,
  type SessionExercise,
  type WorkoutSet
} from "@/lib/training";

type Rest = { endsAt: number; seconds: number; name: string; notification: string | null };

// One workout, set by set. Every change is saved as it happens, so closing the app loses nothing.
// Ticking a set starts that exercise's rest timer; beating an earlier best shows a "New best" badge.
export default function Workout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sheet, toast } = useOverlays();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [histories, setHistories] = useState<Record<string, ExerciseHistory>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [rest, setRest] = useState<Rest | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await trainingApi.session(getApi(), id);
      setSession(next);
      setName(next.type);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Coming back from the exercise picker shows what was added.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // "Last time" and the bests from before this workout, once per exercise.
  const exerciseKeys = session?.exercises.map((exercise) => `${exercise.id}|${exercise.exercise_id ?? ""}|${exercise.name}`).join(",") ?? "";
  useEffect(() => {
    if (!session) return;
    const missing = session.exercises.filter((exercise) => !histories[exercise.id]);
    if (!missing.length) return;
    let stale = false;
    void Promise.all(missing.map((exercise) => trainingApi.history(getApi(), exercise, session.id, 3).then((history) => [exercise.id, history] as const).catch(() => null))).then((rows) => {
      if (stale) return;
      setHistories((current) => ({ ...current, ...Object.fromEntries(rows.filter((row) => row !== null)) }));
    });
    return () => {
      stale = true;
    };
    // Refetches only when the list of exercises changes.
  }, [exerciseKeys]);

  // The session clock and the rest countdown tick every second while either is showing.
  const ticking = Boolean(session?.in_progress || rest);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const left = restLeft(rest?.endsAt ?? null, now);
  const restRef = useRef(rest);
  restRef.current = rest;
  useEffect(() => {
    if (rest && left === 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setRest(null);
    }
  }, [rest, left]);

  const cancelNotification = (current: Rest | null) => {
    if (current?.notification) void Notifications.cancelScheduledNotificationAsync(current.notification).catch(() => undefined);
  };

  // A notification for when the rest ends, in case the phone is locked by then. Only if already allowed.
  const startRest = async (exercise: SessionExercise) => {
    if (!exercise.rest_seconds) return;
    cancelNotification(restRef.current);
    const next: Rest = { endsAt: Date.now() + exercise.rest_seconds * 1000, seconds: exercise.rest_seconds, name: exercise.name, notification: null };
    setRest(next);
    setNow(Date.now());
    if (Platform.OS === "web") return;
    try {
      const { granted } = await Notifications.getPermissionsAsync();
      if (!granted || !notificationAllowed(await loadNotificationPrefs(), "rest")) return;
      const notification = await Notifications.scheduleNotificationAsync({
        content: { title: tt.restTimer, body: `${exercise.name} · ${tt.restDone}`, data: { url: `/workout?id=${id}` } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: exercise.rest_seconds }
      });
      setRest((current) => (current && current.endsAt === next.endsAt ? { ...current, notification } : current));
    } catch {
      // The timer on screen still works.
    }
  };

  const stopRest = () => {
    cancelNotification(restRef.current);
    setRest(null);
  };

  const addRestTime = (seconds: number) => setRest((current) => (current ? { ...current, endsAt: current.endsAt + seconds * 1000, seconds: current.seconds + seconds } : current));

  useEffect(() => () => cancelNotification(restRef.current), []);

  // Saves and puts the server's row back in place.
  const replaceSet = (row: WorkoutSet) =>
    setSession((current) => current && { ...current, exercises: current.exercises.map((exercise) => (exercise.id === row.workout_exercise_id ? { ...exercise, sets: exercise.sets.map((set) => (set.id === row.id ? row : set)) } : exercise)) });

  const failed = (actionError: unknown) => toast(actionError instanceof Error ? actionError.message : String(actionError));

  const saveSet = async (row: WorkoutSet, changes: Partial<WorkoutSet>) => {
    replaceSet({ ...row, ...changes });
    try {
      replaceSet(await trainingApi.updateSet(getApi(), row.id, changes));
    } catch (saveError) {
      replaceSet(row);
      failed(saveError);
    }
  };

  const toggleDone = (exercise: SessionExercise, row: WorkoutSet, values: { weight: number | null; reps: number | null }) => {
    const done = !row.done;
    void saveSet(row, { ...values, done });
    if (done) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      const records = newRecords({ ...row, ...values, done }, histories[exercise.id]?.bests ?? null);
      if (records.length) toast(`${tt.newRecord} · ${exercise.name}`);
      void startRest(exercise);
    }
  };

  const addSet = async (exercise: SessionExercise) => {
    try {
      const row = await trainingApi.addSet(getApi(), exercise);
      setSession((current) => current && { ...current, exercises: current.exercises.map((item) => (item.id === exercise.id ? { ...item, sets: [...item.sets, row] } : item)) });
    } catch (addError) {
      failed(addError);
    }
  };

  const removeSet = async (exercise: SessionExercise, row: WorkoutSet) => {
    setSession((current) => current && { ...current, exercises: current.exercises.map((item) => (item.id === exercise.id ? { ...item, sets: item.sets.filter((set) => set.id !== row.id) } : item)) });
    try {
      await trainingApi.removeSet(getApi(), row.id);
    } catch (removeError) {
      failed(removeError);
      void load();
    }
  };

  const setActions = (exercise: SessionExercise, row: WorkoutSet, index: number) =>
    sheet({
      title: `${tt.set} ${index + 1} · ${setText(row)}`,
      options: [
        { label: row.warmup ? tt.markWork : tt.markWarmup, run: () => void saveSet(row, { warmup: !row.warmup }) },
        { label: `${tt.unit}: ${row.unit === "kg" ? "lb" : "kg"}`, run: () => void saveSet(row, { unit: row.unit === "kg" ? "lb" : "kg" }) },
        { label: tt.removeSet, destructive: true, run: () => void removeSet(exercise, row) }
      ]
    });

  const updateExercise = async (exercise: SessionExercise, changes: { rest_seconds: number }) => {
    setSession((current) => current && { ...current, exercises: current.exercises.map((item) => (item.id === exercise.id ? { ...item, ...changes } : item)) });
    try {
      await trainingApi.updateExercise(getApi(), exercise.id, changes);
    } catch (saveError) {
      failed(saveError);
      void load();
    }
  };

  const pickRest = (exercise: SessionExercise) =>
    sheet({
      title: `${tt.rest} · ${exercise.name}`,
      options: REST_CHOICES.map((seconds) => ({ label: `${seconds === exercise.rest_seconds ? "●" : "○"} ${restText(seconds)}`, run: () => void updateExercise(exercise, { rest_seconds: seconds }) }))
    });

  const exerciseActions = (exercise: SessionExercise) =>
    sheet({
      title: exercise.name,
      options: [
        { label: `${tt.rest}: ${restText(exercise.rest_seconds)}`, run: () => setTimeout(() => pickRest(exercise), 250) },
        ...(exercise.exercise_id ? [{ label: tt.openExercise, run: () => router.push(`/exercises/${encodeURIComponent(exercise.exercise_id ?? "")}`) }] : []),
        {
          label: tt.removeExercise,
          destructive: true,
          run: () =>
            Alert.alert(tt.removeExerciseTitle, tt.removeExerciseBody, [
              {
                text: tt.removeExercise,
                style: "destructive",
                onPress: () =>
                  void trainingApi
                    .removeExercise(getApi(), exercise.id)
                    .then(load)
                    .catch(failed)
              },
              { text: t.cancel, style: "cancel" }
            ])
        }
      ]
    });

  const rename = async () => {
    const next = name.trim();
    if (!session || !next || next === session.type) return setName(session?.type ?? "");
    setSession({ ...session, type: next });
    await trainingApi.rename(getApi(), session.id, next).catch(failed);
  };

  const finish = async () => {
    if (!session) return;
    stopRest();
    try {
      setSession(await trainingApi.finish(getApi(), session.id));
    } catch (finishError) {
      failed(finishError);
    }
  };

  const discard = () =>
    session &&
    Alert.alert(session.in_progress ? tt.discardTitle : tt.deleteTitle, tt.discardBody, [
      {
        text: session.in_progress ? tt.discard : tt.deleteWorkout,
        style: "destructive",
        onPress: () => {
          stopRest();
          void trainingApi
            .discard(getApi(), session.id)
            .then(() => router.back())
            .catch(failed);
        }
      },
      { text: t.cancel, style: "cancel" }
    ]);

  if (!session) {
    return (
      <Screen refreshing={loading} onRefresh={() => void load()}>
        {loading ? <Loading /> : <EmptyState>{error ?? tt.couldNotLoad}</EmptyState>}
      </Screen>
    );
  }

  const totals = sessionTotals(session);
  const duration = session.in_progress ? clock(elapsedSeconds(session.logged_at, now)) : session.duration_minutes !== null ? `${session.duration_minutes} ${t.min}` : "–";

  return (
    <View style={{ flex: 1, backgroundColor: colors.shell }}>
      <Screen title={session.type} stackAction={session.in_progress ? { label: tt.finish, onPress: () => void finish() } : undefined} refreshing={false} onRefresh={() => void load()}>
        <Card>
          <Input value={name} onChangeText={setName} onEndEditing={() => void rename()} onSubmitEditing={() => void rename()} placeholder={tt.namePh} maxLength={160} returnKeyType="done" />
          <StatGrid columns={3}>
            {[
              <StatTile key="time" label={tt.duration} value={duration} size={18} />,
              <StatTile key="sets" label={tt.sets} value={`${totals.done}/${totals.total}`} size={18} />,
              <StatTile key="volume" label={`${tt.volume} · kg`} value={volumeText(totals.volumeKg, false)} size={18} />
            ]}
          </StatGrid>
          <Text style={type.rowSubtitle}>
            {formatDate(session.logged_at, { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            {session.in_progress ? "" : ` · ${tt.finished}`}
          </Text>
        </Card>

        {session.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            history={histories[exercise.id] ?? null}
            onToggle={(row, values) => toggleDone(exercise, row, values)}
            onSave={(row, changes) => void saveSet(row, changes)}
            onSetActions={(row, index) => setActions(exercise, row, index)}
            onAddSet={() => void addSet(exercise)}
            onRest={() => pickRest(exercise)}
            onActions={() => exerciseActions(exercise)}
          />
        ))}

        {!session.exercises.length ? <EmptyState icon="plus">{tt.emptyWorkout}</EmptyState> : null}
        <Button variant={session.exercises.length ? "dark" : "primary"} title={tt.addExercise} onPress={() => router.push({ pathname: "/workout-pick", params: { session: session.id } })} />
        {session.in_progress && session.exercises.length ? <Button variant="primary" title={tt.finish} onPress={() => void finish()} /> : null}
        <Button variant="outline" title={session.in_progress ? tt.discard : tt.deleteWorkout} onPress={discard} />
        <View style={{ height: rest ? 72 : 0 }} />
      </Screen>

      {rest ? (
        <View style={[styles.restBar, { bottom: insets.bottom + 12 }]} accessibilityLiveRegion="polite">
          <Icon name="clock" size={18} color={colors.accentInk} />
          <View style={{ flex: 1 }}>
            <Text style={styles.restClock}>{clock(left)}</Text>
            <Text style={styles.restName} numberOfLines={1}>
              {tt.restTimer} · {rest.name}
            </Text>
          </View>
          <Pressable onPress={() => addRestTime(15)} accessibilityRole="button" style={styles.restButton}>
            <Text style={styles.restButtonText}>+15</Text>
          </Pressable>
          <Pressable onPress={stopRest} accessibilityRole="button" style={styles.restButton}>
            <Text style={styles.restButtonText}>{tt.skip}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ExerciseCard({
  exercise,
  history,
  onToggle,
  onSave,
  onSetActions,
  onAddSet,
  onRest,
  onActions
}: {
  exercise: SessionExercise;
  history: ExerciseHistory | null;
  onToggle: (row: WorkoutSet, values: { weight: number | null; reps: number | null }) => void;
  onSave: (row: WorkoutSet, changes: Partial<WorkoutSet>) => void;
  onSetActions: (row: WorkoutSet, index: number) => void;
  onAddSet: () => void;
  onRest: () => void;
  onActions: () => void;
}) {
  const last = history?.sessions[0] ?? null;
  const bests = history?.bests;
  const lastSets = last?.sets ?? [];
  let work = 0;
  return (
    <Card>
      <View style={styles.exerciseHead}>
        <ExerciseThumb uri={exercise.image_url} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.cardTitle}>{exercise.name}</Text>
          <Text style={type.rowSubtitle}>{last ? `${tt.lastTime}: ${sessionLine(last.sets)}` : history ? tt.firstTime : " "}</Text>
        </View>
        <MoreButton label={exercise.name} onPress={onActions} />
      </View>
      {bests?.heaviest || bests?.one_rep_max ? (
        <View style={styles.badges}>
          {bests.heaviest ? <Badge glyph="▲">{`${tt.records.heaviest} ${setText(bests.heaviest)}`}</Badge> : null}
          {bests.one_rep_max ? <Badge>{`${tt.records.one_rep_max} ${amountText(Math.round(bests.one_rep_max.value), bests.one_rep_max.unit)}`}</Badge> : null}
        </View>
      ) : null}

      <View style={styles.setHeader}>
        <Text style={[styles.headCell, styles.colSet]}>{tt.set}</Text>
        <Text style={[styles.headCell, styles.colPrev]}>{tt.previous}</Text>
        <Text style={[styles.headCell, styles.colInput]}>{exercise.sets[0]?.unit ?? "kg"}</Text>
        <Text style={[styles.headCell, styles.colInput]}>{tt.reps}</Text>
        <View style={styles.colCheck} />
      </View>
      {exercise.sets.map((row, index) => {
        const previous = row.warmup ? null : (lastSets.filter((set) => !set.warmup)[work] ?? null);
        if (!row.warmup) work += 1;
        return (
          <SetRow
            key={row.id}
            row={row}
            label={row.warmup ? tt.warmupShort : digits(work)}
            previous={previous ? shortSet(previous) : "–"}
            records={newRecords(row, bests ?? null)}
            onToggle={(values) => onToggle(row, values)}
            onSave={(changes) => onSave(row, changes)}
            onLongPress={() => onSetActions(row, index)}
          />
        );
      })}
      <View style={styles.exerciseFoot}>
        <RowButton icon="plus" label={tt.addSet} onPress={onAddSet} />
        <Pressable onPress={onRest} accessibilityRole="button" style={styles.restChip}>
          <Icon name="clock" size={14} color={colors.ink} />
          <Text style={type.pill}>
            {tt.rest} {restText(exercise.rest_seconds)}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

function SetRow({
  row,
  label,
  previous,
  records,
  onToggle,
  onSave,
  onLongPress
}: {
  row: WorkoutSet;
  label: string;
  previous: string;
  records: string[];
  onToggle: (values: { weight: number | null; reps: number | null }) => void;
  onSave: (changes: Partial<WorkoutSet>) => void;
  onLongPress: () => void;
}) {
  const [weight, setWeight] = useState(row.weight === null ? "" : String(row.weight));
  const [reps, setReps] = useState(row.reps === null ? "" : String(row.reps));
  // The server's value wins when it changes underneath (another set's unit flip, a reload).
  useEffect(() => setWeight(row.weight === null ? "" : String(row.weight)), [row.weight]);
  useEffect(() => setReps(row.reps === null ? "" : String(row.reps)), [row.reps]);

  const values = () => ({ weight: parseNumber(weight), reps: (() => {
    const value = parseNumber(reps);
    return value === null ? null : Math.round(value);
  })() });
  const commit = () => {
    const next = values();
    if (next.weight !== row.weight || next.reps !== row.reps) onSave(next);
  };

  return (
    <View style={[styles.setRow, row.done && styles.setRowDone]}>
      <Pressable onPress={onLongPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`${tt.set} ${label}`} style={[styles.colSet, styles.setNumber, row.warmup && styles.warmup]}>
        <Text style={[type.badge, { color: row.warmup ? colors.accentTintInk : colors.ink }]}>{label}</Text>
      </Pressable>
      <View style={styles.colPrev}>
        <Text style={type.rowSubtitle} numberOfLines={1}>
          {previous}
        </Text>
        {records.length ? <Text style={styles.record}>▲ {tt.newRecord}</Text> : null}
      </View>
      <TextInput value={weight} onChangeText={setWeight} onEndEditing={commit} keyboardType="decimal-pad" placeholder="–" placeholderTextColor={colors.inkFaint} selectTextOnFocus style={[styles.cell, styles.colInput]} accessibilityLabel={tt.weight} />
      <TextInput value={reps} onChangeText={setReps} onEndEditing={commit} keyboardType="number-pad" placeholder="–" placeholderTextColor={colors.inkFaint} selectTextOnFocus style={[styles.cell, styles.colInput]} accessibilityLabel={tt.reps} />
      <View style={styles.colCheck}>
        <CheckItem checked={row.done} label={`${tt.set} ${label}`} onPress={() => onToggle(values())} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  exerciseHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  setHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  headCell: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted, textAlign: "center" },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, borderRadius: radius.control, paddingHorizontal: 2 },
  setRowDone: { backgroundColor: colors.accentTint },
  colSet: { width: 30, alignItems: "center" },
  colPrev: { flex: 1, minWidth: 0 },
  colInput: { width: 64 },
  colCheck: { width: 36, alignItems: "center" },
  setNumber: { height: 28, borderRadius: radius.badge, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  warmup: { backgroundColor: colors.accentTint, borderWidth: 1, borderColor: colors.accentLine },
  cell: { height: 38, borderRadius: radius.control, backgroundColor: colors.field, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", paddingHorizontal: 4 },
  record: { fontFamily: fonts.semibold, fontSize: 10, color: colors.accent },
  exerciseFoot: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  restChip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline },
  restBar: { position: "absolute", start: 16, end: 16, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: colors.accent, maxWidth: 728, alignSelf: "center" },
  restClock: { fontFamily: fonts.bold, fontSize: 22, color: colors.accentInk },
  restName: { fontFamily: fonts.medium, fontSize: 12, color: colors.accentInk },
  restButton: { minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: "rgba(10,10,11,0.12)", alignItems: "center", justifyContent: "center" },
  restButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk }
});
