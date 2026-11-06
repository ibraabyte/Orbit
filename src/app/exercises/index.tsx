import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, ListRow, type } from "@/components/drift";
import { Chip, ExerciseThumb } from "@/components/exercise-ui";
import { useOverlays } from "@/components/overlays";
import { BleedRow, Button, Loading, Screen, SearchBar } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { et, exercisesApi, exerciseSubtitle, GYM_EQUIPMENT, hiddenNote, injuryNote, label, MUSCLES, NO_EQUIPMENT, type ExerciseSearch, type GymEquipment, type Muscle } from "@/lib/exercises";

// Search the exercise library. "Only my gym" keeps what your gym's equipment allows; active injuries hide
// exercises that mainly work the injured area unless you ask to see them.
export default function Exercises() {
  const { sheet } = useOverlays();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [onlyMyGym, setOnlyMyGym] = useState(false);
  const [includeInjured, setIncludeInjured] = useState(false);
  const [gym, setGym] = useState<GymEquipment | null>(null);
  const [result, setResult] = useState<ExerciseSearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  // The gym list can change on the gym screen; turn the filter on the first time it has something in it.
  useFocusEffect(
    useCallback(() => {
      void exercisesApi
        .gym(getApi())
        .then((next) => {
          setGym((previous) => {
            if (!previous && next.equipment.length) setOnlyMyGym(true);
            return next;
          });
        })
        .catch(() => undefined);
    }, [])
  );

  const load = useCallback(
    async (offset = 0) => {
      const id = ++request.current;
      setLoading(true);
      try {
        const page = await exercisesApi.search(getApi(), { q: query, muscle, equipment, onlyMyGym, includeInjured, offset });
        if (id !== request.current) return;
        setResult((current) => (offset && current ? { ...page, items: [...current.items, ...page.items] } : page));
        setError(null);
      } catch (loadError) {
        if (id === request.current) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [query, muscle, equipment, onlyMyGym, includeInjured]
  );

  // Wait for typing to pause before asking the server.
  useEffect(() => {
    const timer = setTimeout(() => void load(0), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const pickEquipment = () =>
    sheet({
      title: et.equipment,
      options: [null, NO_EQUIPMENT, ...GYM_EQUIPMENT].map((item) => ({
        label: `${equipment === item ? "●" : "○"} ${item ? label(item) : et.anyEquipment}`,
        run: () => setEquipment(item)
      }))
    });

  const note = result ? hiddenNote(result) : null;
  const gymEmpty = onlyMyGym && gym !== null && gym.equipment.length === 0;

  return (
    <Screen refreshing={loading && !result} onRefresh={() => void load(0)}>
      <SearchBar placeholder={et.searchExercises} value={query} onChangeText={setQuery} autoCorrect={false} />
      <BleedRow>
        <Chip label={et.onlyMyGym} icon="home" on={onlyMyGym} onPress={() => setOnlyMyGym(!onlyMyGym)} />
        <Chip label={equipment ? label(equipment) : et.equipment} icon="tool" on={Boolean(equipment)} onPress={pickEquipment} />
        <Chip label={et.showInjured} icon="alert-triangle" on={includeInjured} onPress={() => setIncludeInjured(!includeInjured)} />
      </BleedRow>
      <BleedRow>
        <Chip label={et.allMuscles} on={!muscle} onPress={() => setMuscle(null)} />
        {MUSCLES.map((item) => (
          <Chip key={item} label={label(item)} on={muscle === item} onPress={() => setMuscle(muscle === item ? null : item)} />
        ))}
      </BleedRow>

      {gymEmpty ? (
        <Card>
          <Text style={type.rowSubtitle}>{et.setUpGym}</Text>
          <Button variant="primary" title={et.setUpGymAction} onPress={() => router.push("/gym")} />
        </Card>
      ) : null}

      {result ? (
        <View style={{ gap: 4, paddingHorizontal: 4 }}>
          <Text style={type.shellMeta}>{et.results(result.total)}</Text>
          {note ? <Text style={type.shellMuted}>{note}</Text> : null}
        </View>
      ) : null}

      {!result ? (
        loading ? <Loading /> : <EmptyState>{error ?? et.couldNotLoad}</EmptyState>
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
                href={`/exercises/${encodeURIComponent(exercise.id)}`}
              />
            );
          })}
        </Card>
      )}

      {result && result.items.length < result.total ? <Button variant="outline" title={et.loadMore} disabled={loading} onPress={() => void load(result.items.length)} /> : null}
      <Text style={[type.shellMuted, { textAlign: "center", fontSize: 11 }]}>{et.photoCredit}</Text>
    </Screen>
  );
}
