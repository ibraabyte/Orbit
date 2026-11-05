import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { Card, CheckItem, EmptyState, ListRow, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { et, exercisesApi, GYM_EQUIPMENT, label, NO_EQUIPMENT, orderedGym, toggleItem, type GymItem } from "@/lib/exercises";

// Your gym's equipment. Exercise search's "Only my gym" uses this list.
export default function Gym() {
  const { toast } = useOverlays();
  const [saved, setSaved] = useState<GymItem[] | null>(null);
  const [picked, setPicked] = useState<GymItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const gym = await exercisesApi.gym(getApi());
      setSaved(gym.equipment);
      setPicked(gym.equipment);
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

  const save = async () => {
    setSaving(true);
    try {
      const gym = await exercisesApi.setGym(getApi(), orderedGym(picked));
      setSaved(gym.equipment);
      setPicked(gym.equipment);
      toast(et.gymSaved);
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (saved === null) {
    return (
      <Screen refreshing={loading} onRefresh={load}>
        {loading ? <Loading /> : <EmptyState>{error ?? et.couldNotLoad}</EmptyState>}
      </Screen>
    );
  }

  const changed = orderedGym(picked).join() !== orderedGym(saved).join();

  return (
    <Screen refreshing={loading} onRefresh={load} stackAction={changed && !saving ? { label: et.saveGym, onPress: () => void save() } : undefined}>
      <Text style={[type.shellMuted, { paddingHorizontal: 4 }]}>{et.gymHint}</Text>
      <Card title={et.gym} action={<Text style={type.rowSubtitle}>{et.gymCount(picked.length)}</Text>}>
        <ListRow title={label(NO_EQUIPMENT)} trailing={<CheckItem checked onPress={() => undefined} label={label(NO_EQUIPMENT)} />} />
        {GYM_EQUIPMENT.map((item) => {
          const toggle = () => setPicked((current) => toggleItem(current, item));
          return <ListRow key={item} title={label(item)} onPress={toggle} trailing={<CheckItem checked={picked.includes(item)} onPress={toggle} label={label(item)} />} />;
        })}
      </Card>
      <Button variant="primary" title={et.saveGym} disabled={!changed || saving} onPress={() => void save()} />
    </Screen>
  );
}
