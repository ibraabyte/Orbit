import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, Icon, IconTile, ListRow, type, type IconName } from "@/components/drift";
import { colors } from "@/components/theme";
import { getApi } from "@/lib/backend";
import { choiceLabel, featuresApi, featureSummary, featuresOf, type Feature, type FeatureStatus } from "@/lib/feature-models";
import { t } from "@/lib/i18n";
import type { IntegrationsOverview } from "@/lib/integrations";

const ICONS: Record<Feature, IconName> = {
  assistant: "message-circle",
  food_text: "edit-3",
  food_photo: "camera",
  health: "activity",
  week: "calendar",
  saver: "bookmark",
  speech: "mic",
  call: "phone-call",
  phone_agent: "phone-outgoing"
};

// One row per AI feature. Tapping a row opens its choices: the default, then only what this person connected.
export function FeatureModelsCard({ overview, onSaved }: { overview: IntegrationsOverview; onSaved: (features: FeatureStatus[]) => void }) {
  const [open, setOpen] = useState<Feature | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = featuresOf(overview);
  if (!rows.length) return null;
  const stale = rows.filter((row) => row.stale).length;

  const pick = async (row: FeatureStatus, choice: string | null) => {
    if (saving) return;
    setSaving(true);
    try {
      onSaved(await featuresApi.set(getApi(), row.feature, choice));
      setOpen(null);
    } catch (error) {
      Alert.alert(t.featuresTitle, error instanceof Error ? error.message : t.featureSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t.featuresTitle} action={stale ? <Badge tone="accent">{String(stale)}</Badge> : undefined}>
      <Text style={type.rowSubtitle}>{t.featuresIntro}</Text>
      {rows.map((row) => {
        const expanded = open === row.feature;
        const canPick = row.options.length > 0 && !(row.kind === "speech" && row.options.length < 2 && !row.stale);
        return (
          <View key={row.feature}>
            <ListRow
              leading={<IconTile name={ICONS[row.feature]} tone={row.stale ? "urgent" : "neutral"} />}
              title={t.featureNames[row.feature]}
              subtitle={featureSummary(row, overview)}
              onPress={canPick ? () => setOpen(expanded ? null : row.feature) : undefined}
              trailing={canPick ? <Icon name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} /> : undefined}
            />
            {expanded ? (
              <View style={styles.options}>
                <Option label={row.default ? `${t.featureDefaultOption} · ${choiceLabel(row, row.default, overview)}` : t.featureDefaultOption} selected={row.choice === null} disabled={saving} onPress={() => void pick(row, null)} />
                {row.options.map((choice) => (
                  <Option key={choice} label={choiceLabel(row, choice, overview)} selected={row.choice === choice} disabled={saving} onPress={() => void pick(row, choice)} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

function Option({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [styles.option, selected && styles.selected, pressed && { opacity: 0.7 }]}
    >
      <Text style={[type.rowSubtitle, styles.label, selected && { color: colors.accentDeep }]} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Icon name="check" size={14} color={colors.accentDeep} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  options: { gap: 6, paddingBottom: 8, paddingStart: 42 },
  option: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  selected: { borderColor: colors.accentLine, backgroundColor: colors.accentTint },
  label: { flex: 1, fontSize: 13, color: colors.ink }
});
