import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { Badge, Card, EmptyState, Icon, ListRow, type } from "@/components/drift";
import { Chip, ExerciseThumb } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { BleedRow, Loading, Screen, SearchBar } from "@/components/screen";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { et, exercisesApi, exerciseSubtitle, injuryNote, label, MUSCLES, type ExerciseSearch, type Muscle } from "@/lib/exercises";
import { trainingApi, tt } from "@/lib/training";

// Pick an exercise for a workout: the library fitted to your gym and injuries, or your own name for one.
export default function WorkoutPick() {
  const { session } = useLocalSearchParams<{ session: string }>();
  const { toast } = useOverlays();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [onlyMyGym, setOnlyMyGym] = useState(true);
  const [result, setResult] = useState<ExerciseSearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const page = await exercisesApi.search(getApi(), { q: query, muscle, onlyMyGym, limit: 60 });
      if (id === request.current) setResult(page);
    } catch {
      if (id === request.current) setResult(null);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [query, muscle, onlyMyGym]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const add = async (body: { exercise_id?: string; name?: string }) => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await trainingApi.addExercise(getApi(), session, { ...body, sets: 3 });
      router.back();
    } catch (addError) {
      toast(addError instanceof Error ? addError.message : String(addError));
      setBusy(false);
    }
  };

  const typed = query.trim();

  return (
    <Screen>
      <SearchBar placeholder={tt.searchPh} value={query} onChangeText={setQuery} autoCorrect={false} autoFocus />
      <BleedRow>
        <Chip label={et.onlyMyGym} icon="home" on={onlyMyGym} onPress={() => setOnlyMyGym(!onlyMyGym)} />
        {MUSCLES.map((item) => (
          <Chip key={item} label={label(item)} on={muscle === item} onPress={() => setMuscle(muscle === item ? null : item)} />
        ))}
      </BleedRow>

      {typed ? (
        <Card list>
          <ListRow first leading={<Icon name="edit-3" size={18} color={colors.accent} />} title={tt.custom(typed)} onPress={() => void add({ name: typed })} />
        </Card>
      ) : null}

      {!result ? (
        loading ? <Loading /> : <EmptyState>{tt.couldNotLoad}</EmptyState>
      ) : (
        <Card list>
          {!result.items.length ? <EmptyState>{et.noMatches}</EmptyState> : null}
          {result.items.map((exercise, index) => {
            const warning = injuryNote(exercise);
            return (
              <ListRow
                key={exercise.id}
                first={index === 0}
                leading={<ExerciseThumb uri={exercise.image_url} />}
                title={exercise.name}
                subtitle={exerciseSubtitle(exercise)}
                badges={warning ? <Badge tone={warning.tone} glyph="△">{label(exercise.avoid[0] ?? exercise.caution[0])}</Badge> : undefined}
                trailing={<Icon name="plus" size={18} />}
                onPress={() => void add({ exercise_id: exercise.id })}
              />
            );
          })}
        </Card>
      )}
      <Text style={[type.shellMuted, { textAlign: "center", fontSize: 11 }]}>{et.photoCredit}</Text>
    </Screen>
  );
}
