import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Input, Screen, ui } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getApi } from "@/lib/backend";
import { goalFields, goalsBody, goalsChanged, goalsForm, ht, type GoalsForm } from "@/lib/health-hub";

// Daily calorie and macro goals, and workout minutes a week. Saved on your profile; Food, Health and Today read them.
export default function HealthGoals() {
  const { data, refresh } = useDashboardData();
  const { toast } = useOverlays();
  const [form, setForm] = useState<GoalsForm>(() => goalsForm(data.profile));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The profile can arrive after the screen opens (cold start); fill the boxes once it does.
  const profileId = data.profile?.id;
  useEffect(() => {
    if (profileId) setForm(goalsForm(data.profile));
  }, [profileId]);

  const changed = goalsChanged(form, data.profile);

  const save = async () => {
    const result = goalsBody(form);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await getApi().patch("/profile", result.body);
      await refresh();
      toast(ht.goalsSaved);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen stackAction={changed && !saving ? { label: ht.saveGoals, onPress: () => void save() } : undefined}>
      <Text style={[type.shellMuted, { paddingHorizontal: 4 }]}>{ht.goalsHint}</Text>
      <Card title={ht.goals}>
        {goalFields.map((field) => (
          <View key={field.key} style={{ gap: 6, paddingVertical: 4 }}>
            <Text style={type.tileLabel}>{field.label}</Text>
            <Input
              value={form[field.key]}
              onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
              placeholder={field.required ? "150" : ht.notSet}
              keyboardType="number-pad"
              accessibilityLabel={field.label}
              maxLength={5}
            />
          </View>
        ))}
      </Card>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Button variant="primary" title={ht.saveGoals} disabled={!changed || saving} onPress={() => void save()} />
    </Screen>
  );
}
