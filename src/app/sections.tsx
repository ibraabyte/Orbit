import { Switch, Text, View } from "react-native";
import { Card, IconTile, ListRow, type, type IconName } from "@/components/drift";
import { GroupHeader, Screen } from "@/components/screen";
import { colors } from "@/components/theme";
import { useSections } from "@/hooks/use-sections";
import { INSIDE, st, type SectionKey } from "@/lib/app-sections";

const ICONS: Record<SectionKey, IconName> = {
  health: "activity",
  food: "coffee",
  exercises: "zap",
  whoop: "watch",
  finance: "credit-card",
  habits: "repeat",
  library: "bookmark",
  vehicles: "truck",
  media: "film"
};
const TOP: SectionKey[] = ["health", "finance", "habits", "library", "vehicles", "media"];

// Settings → Sections: one switch per part of Orbit. Off means hidden everywhere, never deleted.
export default function Sections() {
  const { hidden, saved, setOn } = useSections();
  const healthOff = saved.includes("health");
  const track = { true: colors.accent, false: colors.hairline };

  const row = (key: SectionKey, first: boolean, underHealth = false) => {
    const lockedOff = underHealth && healthOff;
    return (
      <ListRow
        key={key}
        first={first}
        leading={<IconTile name={ICONS[key]} tone={hidden.has(key) ? "neutral" : "accent"} />}
        title={st.names[key]}
        subtitle={lockedOff ? st.offWithHealth : st.details[key]}
        trailing={
          <Switch
            accessibilityLabel={st.names[key]}
            trackColor={track}
            thumbColor={colors.ink}
            value={!hidden.has(key)}
            disabled={lockedOff}
            onValueChange={(next) => void setOn(key, next)}
          />
        }
      />
    );
  };

  return (
    <Screen title={st.sections}>
      <Text style={type.rowSubtitle}>{st.sectionsDetail}</Text>
      <Card list>{TOP.map((key, index) => row(key, index === 0))}</Card>
      <View style={{ gap: 8 }}>
        <GroupHeader label={st.insideHealth} />
        <Card list>{INSIDE.health!.map((key, index) => row(key, index === 0, true))}</Card>
      </View>
      <Text style={type.rowSubtitle}>{st.alwaysOn}</Text>
    </Screen>
  );
}
