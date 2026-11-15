import { View } from "react-native";
import { ConnectionTile, TileGrid } from "@/components/ai-provider-parts";
import { IconTile, type IconName } from "@/components/drift";
import { GroupHeader, Screen } from "@/components/screen";
import { colors, space } from "@/components/theme";
import { useSections } from "@/hooks/use-sections";
import { INSIDE, st, type SectionKey } from "@/lib/app-sections";

const ICONS: Record<SectionKey, IconName> = {
  health: "heart",
  food: "fork-knife",
  exercises: "dumbbell",
  whoop: "activity",
  medications: "pills",
  finance: "credit-card",
  habits: "repeat",
  library: "saver",
  vehicles: "truck",
  documents: "file-text",
  shipments: "package",
  media: "film"
};
const TOP: SectionKey[] = ["health", "finance", "habits", "library", "vehicles", "documents", "shipments", "media"];

// Settings → Sections: one tile per part of Orbit. Off means hidden everywhere, never deleted.
export default function Sections() {
  const { hidden, saved, setOn } = useSections();
  const healthOff = saved.includes("health");

  // One tile per part: tap turns it on or off. Parts inside Health stay off and locked while Health is off.
  const tile = (key: SectionKey, underHealth = false) => {
    const lockedOff = underHealth && healthOff;
    const on = !hidden.has(key);
    return (
      <ConnectionTile
        key={key}
        mark={<IconTile name={ICONS[key]} size={36} tone={on ? "sand" : "neutral"} />}
        name={st.names[key]}
        badge={on ? "check" : null}
        checked={on}
        label={lockedOff ? `${st.names[key]}, ${st.offWithHealth}` : st.names[key]}
        onPress={lockedOff ? undefined : () => void setOn(key, !on)}
      />
    );
  };

  return (
    <Screen title={st.sections}>
      <TileGrid>{TOP.map((key) => tile(key))}</TileGrid>
      <View style={{ gap: space.sm }}>
        <GroupHeader label={st.insideHealth} />
        <TileGrid>{INSIDE.health!.map((key) => tile(key, true))}</TileGrid>
      </View>
    </Screen>
  );
}
