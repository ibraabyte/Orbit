import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, Icon, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { et, exercisesApi, injuryNote, label, type ExerciseDetail } from "@/lib/exercises";
import { formatDate } from "@/lib/i18n";
import { amountText, sessionLine, setText, trainingApi, tt, volumeText, type Best, type ExerciseHistory, type Session } from "@/lib/training";

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [active, setActive] = useState<Session | null>(null);
  const { toast } = useOverlays();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const api = getApi();
      const [detail, past, live] = await Promise.all([exercisesApi.detail(api, id), trainingApi.history(api, { exercise_id: id, name: "" }, undefined, 5).catch(() => null), trainingApi.active(api).catch(() => null)]);
      setExercise(detail);
      setHistory(past);
      setActive(live);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!exercise) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {loading ? <Loading /> : <EmptyState>{error ?? et.couldNotLoad}</EmptyState>}
      </Screen>
    );
  }

  const warning = injuryNote(exercise);
  const bests = history?.bests;
  const bestRows: [string, Best | null | undefined, (best: Best) => string][] = [
    [tt.heaviest, bests?.heaviest, setText],
    [tt.oneRepMax, bests?.one_rep_max, (best) => amountText(Math.round(best.value), best.unit)],
    [tt.mostReps, bests?.most_reps, setText],
    [tt.bestVolume, bests?.best_volume, (best) => volumeText(best.value)]
  ];
  const addToWorkout = async () => {
    if (!active) return;
    try {
      await trainingApi.addExercise(getApi(), active.id, { exercise_id: exercise.id, sets: 3 });
      router.push({ pathname: "/workout", params: { id: active.id } });
    } catch (addError) {
      toast(addError instanceof Error ? addError.message : String(addError));
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={[type.h1, { paddingHorizontal: 4 }]}>{exercise.name}</Text>

      {exercise.image_urls.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -20, flexGrow: 0 }}>
          <View style={{ width: 10 }} />
          {exercise.image_urls.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
          ))}
          <View style={{ width: 10 }} />
        </ScrollView>
      ) : null}

      {warning ? (
        <Card>
          <View style={styles.warning}>
            <Icon name="alert-triangle" size={18} color={warning.tone === "urgent" ? colors.dangerOnShell : colors.accentTintInk} />
            <Text style={[type.body, { flex: 1 }]}>{warning.text}</Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <Fact name={et.equipment} value={label(exercise.equipment)} extra={exercise.in_my_gym ? undefined : et.notInGym} />
        <Fact name={et.primary} value={exercise.primary_muscles.map(label).join(", ")} />
        {exercise.secondary_muscles.length ? <Fact name={et.secondary} value={exercise.secondary_muscles.map(label).join(", ")} /> : null}
        <View style={styles.badges}>
          <Badge>{label(exercise.level)}</Badge>
          <Badge>{label(exercise.category)}</Badge>
          {exercise.mechanic ? <Badge>{label(exercise.mechanic)}</Badge> : null}
        </View>
      </Card>

      {active ? <Button variant="primary" title={`${tt.addExercise} · ${active.type}`} onPress={() => void addToWorkout()} /> : null}

      {history ? (
        <Card title={tt.bests}>
          {!history.sessions.length ? <Text style={type.rowSubtitle}>{tt.noHistory}</Text> : null}
          {bestRows.map(([name, best, show]) =>
            best ? <ListRow key={name} title={name} subtitle={formatDate(best.logged_at, { day: "numeric", month: "short", year: "numeric" })} meta={show(best)} /> : null
          )}
          {history.sessions.length ? <Text style={[type.sectionLabel, { paddingTop: 8 }]}>{tt.recentSessions}</Text> : null}
          {history.sessions.map((past) => (
            <ListRow key={past.workout_id} href={{ pathname: "/workout", params: { id: past.workout_id } }} title={sessionLine(past.sets)} subtitle={formatDate(past.logged_at, { weekday: "short", day: "numeric", month: "short" })} meta={past.volume_kg ? volumeText(past.volume_kg) : undefined} />
          ))}
        </Card>
      ) : null}

      <Card title={et.steps}>
        {exercise.instructions.map((step, index) => (
          <View key={index} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={[type.badge, { color: colors.accentInk }]}>{index + 1}</Text>
            </View>
            <Text style={[type.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </Card>
      <Text style={[type.shellMuted, { textAlign: "center", fontSize: 11 }]}>{et.photoCredit}</Text>
    </Screen>
  );
}

function Fact({ name, value, extra }: { name: string; value: string; extra?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={type.tileLabel}>{name}</Text>
      <Text style={type.rowTitle}>{value}</Text>
      {extra ? <Text style={type.rowSubtitle}>{extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 260, height: 190, borderRadius: radius.tile, backgroundColor: colors.surfaceInset },
  warning: { flexDirection: "row", alignItems: "center", gap: 10 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  step: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginTop: 1 }
});
