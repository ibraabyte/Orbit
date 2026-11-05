import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Badge, Card, EmptyState, IconTile, ListRow, MoreButton, type } from "@/components/drift";
import { Chip } from "@/components/exercise-ui";
import { toDateKey, useOverlays } from "@/components/overlays";
import { Button, Input, Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { et, exercisesApi, INJURY_JOINTS, INJURY_MUSCLES, label, sortInjuries, type Injury, type InjuryArea } from "@/lib/exercises";
import { formatDate, t } from "@/lib/i18n";

// Injuries you're working around. Active ones change what Exercises suggests.
export default function Injuries() {
  const { sheet, toast, pickDate } = useOverlays();
  const [injuries, setInjuries] = useState<Injury[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState<InjuryArea>("knee");
  const [note, setNote] = useState("");
  const [since, setSince] = useState(() => toDateKey(new Date()));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInjuries(sortInjuries(await exercisesApi.injuries(getApi())));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (actionError) {
      toast(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      await exercisesApi.addInjury(getApi(), area, note, since);
      setNote("");
    });

  const pickArea = () =>
    sheet({
      title: et.where,
      options: [...INJURY_JOINTS, ...INJURY_MUSCLES].map((item) => ({ label: `${item === area ? "●" : "○"} ${label(item)}`, run: () => setArea(item) }))
    });

  const pickSince = async () => {
    const picked = await pickDate(et.since, since);
    if (picked) setSince(picked);
  };

  const actions = (injury: Injury) =>
    sheet({
      title: label(injury.area),
      detail: injury.note ?? undefined,
      options: [
        injury.active
          ? { label: et.markHealed, run: () => void run(() => exercisesApi.heal(getApi(), injury, toDateKey(new Date()))) }
          : { label: et.reopen, run: () => void run(() => exercisesApi.reopen(getApi(), injury)) },
        {
          label: et.deleteInjury,
          destructive: true,
          run: () =>
            Alert.alert(et.deleteInjuryTitle, et.deleteInjuryBody, [
              { text: et.deleteInjury, style: "destructive", onPress: () => void run(() => exercisesApi.deleteInjury(getApi(), injury.id)) },
              { text: t.cancel, style: "cancel" }
            ])
        }
      ]
    });

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={[type.shellMuted, { paddingHorizontal: 4 }]}>{et.injuriesHint}</Text>

      <Card title={et.addInjury}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={`${et.where}: ${label(area)}`} icon="map-pin" on onPress={pickArea} />
          <Chip label={`${et.since}: ${formatDate(`${since}T12:00:00`)}`} icon="calendar" on={false} onPress={() => void pickSince()} />
        </View>
        <Input placeholder={et.notePh} value={note} onChangeText={setNote} maxLength={500} />
        <Button variant="primary" title={et.addInjury} disabled={busy} onPress={() => void add()} />
      </Card>

      {!injuries ? (
        loading ? <Loading /> : <EmptyState>{error ?? et.couldNotLoad}</EmptyState>
      ) : (
        <Card title={et.injuries}>
          {!injuries.length ? <EmptyState icon="heart">{et.noInjuries}</EmptyState> : null}
          {injuries.map((injury) => (
            <ListRow
              key={injury.id}
              leading={<IconTile name={injury.active ? "alert-triangle" : "check"} tone={injury.active ? "urgent" : "neutral"} />}
              title={label(injury.area)}
              badges={<Badge tone={injury.active ? "urgent" : "success"}>{injury.active ? et.active : et.healed}</Badge>}
              subtitle={[injury.started_on ? `${et.since} ${formatDate(`${injury.started_on}T12:00:00`)}` : null, injury.note].filter(Boolean).join(" · ") || null}
              trailing={<MoreButton label={label(injury.area)} onPress={() => actions(injury)} />}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
