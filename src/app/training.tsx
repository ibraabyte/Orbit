import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, RowButton, TrendBars, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, GroupHeader, Loading, Screen } from "@/components/screen";
import { colors, fonts, radius, space, textSize } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { et } from "@/lib/exercises";
import { digits, formatDate, t } from "@/lib/i18n";
import { pt } from "@/lib/plan";
import { trainingApi, tt, volumeText, weekMinutes, type SessionSummary } from "@/lib/training";

const stamp = (iso: string) => formatDate(iso, { weekday: "short", day: "numeric", month: "short" });
const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

// Workouts logged set by set: the one going now on top, the places to go, this week's minutes, then the history.
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
  const week = weekMinutes(sessions ?? []);
  const weekTotal = week.reduce((sum, minutes) => sum + minutes, 0);
  const weekCount = (sessions ?? []).filter((session) => Date.now() - new Date(session.logged_at).getTime() < 7 * 86400000).length;
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - index));
    return index === 6 ? t.today : formatDate(day, { weekday: "short" });
  });

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
        <Card style={{ gap: space.lg, paddingVertical: space.lg }}>
          <ListRow
            first
            leading={<IconTile name="play" size={36} tone="accent" />}
            title={live.type}
            subtitle={[stamp(live.logged_at), live.exercise_names.length ? tt.exercisesCount(live.exercise_names.length) : null].filter(Boolean).join(" · ")}
            trailing={<Badge tone="accent" glyph="●">{tt.inProgress}</Badge>}
          />
          <View style={styles.stats}>
            <LiveStat value={`${digits(minutesSince(live.logged_at))} ${t.min}`} label={tt.duration} />
            <LiveStat value={digits(live.sets_done)} label={tt.sets} />
            <LiveStat value={live.volume_kg ? volumeText(live.volume_kg) : "—"} label={tt.volume} />
          </View>
          <Button title={tt.resume} onPress={() => router.push({ pathname: "/workout", params: { id: live.id } })} />
        </Card>
      ) : (
        <Button title={tt.startWorkout} disabled={busy} onPress={() => void begin()} />
      )}

      <Card list>
        <ListRow first href="/plan" leading={<IconTile name="calendar" size={36} />} title={pt.plan} subtitle={pt.planDetail} />
        <ListRow href="/exercises" leading={<IconTile name="book-open" size={36} />} title={et.exercises} />
        <ListRow href="/gym" leading={<IconTile name="home" size={36} />} title={et.gym} />
      </Card>

      {sessions ? (
        <View>
          <GroupHeader label={`${t.week} · ${digits(weekCount)} ${t.workouts}`} />
          <Card>
            <TrendBars values={week} labels={weekDays} height={72} label={`${t.week}: ${digits(week.join(", "))}`} highlight={6} />
            <Text style={[type.rowSubtitle, { textAlign: "center" }]}>{t.weekMinutes.replace("{n}", digits(weekTotal))}</Text>
          </Card>
        </View>
      ) : null}

      {!sessions ? (
        loading ? <Loading /> : <EmptyState>{error ?? tt.couldNotLoad}</EmptyState>
      ) : (
        <View>
          <GroupHeader label={tt.history} />
          <Card list={past.length > 0}>
            {!past.length ? <EmptyState icon="activity">{tt.noSessions}</EmptyState> : null}
            {past.map((session, index) => (
              <ListRow
                key={session.id}
                first={index === 0}
                href={{ pathname: "/workout", params: { id: session.id } }}
                title={session.type}
                subtitle={[stamp(session.logged_at), session.exercise_names.slice(0, 3).join(", "), session.exercise_names.length > 3 ? `+${digits(session.exercise_names.length - 3)}` : null].filter(Boolean).join(" · ")}
                meta={session.volume_kg ? volumeText(session.volume_kg) : session.duration_minutes ? `${session.duration_minutes} ${t.min}` : undefined}
                trailing={live ? undefined : <RowButton outline icon="repeat" label={tt.repeat} disabled={busy} onPress={() => void begin(session.id)} />}
              />
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

function LiveStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={type.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, alignItems: "center", gap: space.xxs, paddingVertical: space.md, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.surfaceInset },
  statValue: { fontFamily: fonts.bold, fontSize: textSize.title3, color: colors.ink }
});
