import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { et } from "@/lib/exercises";
import { digits, formatDate, t } from "@/lib/i18n";
import { trainingApi, tt, volumeText, type SessionSummary } from "@/lib/training";

const stamp = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });

// Workouts logged set by set: start or resume one, repeat a past one, and the history.
export default function Training() {
  const { toast } = useOverlays();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await trainingApi.sessions(getApi(), 60));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const live = sessions?.find((session) => session.in_progress) ?? null;
  const past = sessions?.filter((session) => !session.in_progress) ?? [];

  const begin = async (repeatOf?: string) => {
    setBusy(true);
    try {
      const session = await trainingApi.start(getApi(), repeatOf ? { repeat_of: repeatOf } : { type: tt.defaultName });
      router.push({ pathname: "/workout", params: { id: session.id } });
    } catch (startError) {
      toast(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={loading && Boolean(sessions)} onRefresh={() => void load()}>
      {live ? (
        <Card>
          <ListRow
            first
            leading={<IconTile name="play" tone="accent" />}
            title={live.type}
            badges={<Badge tone="accent" glyph="●">{tt.inProgress}</Badge>}
            subtitle={[stamp(live.logged_at), live.exercise_names.length ? tt.exercisesCount(live.exercise_names.length) : null].filter(Boolean).join(" · ")}
          />
          <Button variant="primary" title={tt.resume} onPress={() => router.push({ pathname: "/workout", params: { id: live.id } })} />
        </Card>
      ) : (
        <Button variant="primary" title={tt.startWorkout} disabled={busy} onPress={() => void begin()} />
      )}

      {!sessions ? (
        loading ? <Loading /> : <EmptyState>{error ?? tt.couldNotLoad}</EmptyState>
      ) : (
        <Card title={tt.history}>
          {!past.length ? <EmptyState icon="activity">{tt.noSessions}</EmptyState> : null}
          {past.map((session) => (
            <ListRow
              key={session.id}
              href={{ pathname: "/workout", params: { id: session.id } }}
              title={session.type}
              subtitle={[stamp(session.logged_at), session.exercise_names.slice(0, 3).join(isList), session.exercise_names.length > 3 ? `+${digits(session.exercise_names.length - 3)}` : null].filter(Boolean).join(" · ")}
              meta={session.volume_kg ? volumeText(session.volume_kg) : session.duration_minutes ? `${session.duration_minutes} ${t.min}` : undefined}
              trailing={live ? undefined : <RowButton outline icon="repeat" label={tt.repeat} disabled={busy} onPress={() => void begin(session.id)} />}
            />
          ))}
        </Card>
      )}

      <View style={{ paddingHorizontal: 4 }}>
        <Text style={[type.shellMuted, { textAlign: "center" }]} onPress={() => router.push("/exercises")}>
          {et.exercises} ›
        </Text>
      </View>
    </Screen>
  );
}

const isList = ", ";
