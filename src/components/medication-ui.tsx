import { StyleSheet, Text, View } from "react-native";
import { Badge, RowButton, type, type BadgeTone } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { colors, fonts } from "@/components/theme";
import { useDoseActions } from "@/hooks/use-medications";
import { formatClock24 } from "@/lib/i18n";
import { rx, type DoseState, type ScheduledDose } from "@/lib/medications";

const TONES: Record<DoseState, BadgeTone> = { taken: "success", skipped: "neutral", upcoming: "neutral", due: "accent", missed: "urgent" };
const GLYPHS: Record<DoseState, string> = { taken: "✓", skipped: "–", upcoming: "○", due: "●", missed: "!" };

/** One of the day's doses: its time, the medicine and dose, where it stands, and Taken (or Undo once answered). */
export function DoseRow({ entry, first }: { entry: ScheduledDose; first?: boolean }) {
  const { take, skip, undo } = useDoseActions();
  const { sheet, toast } = useOverlays();
  const { medication, state } = entry;
  const open = !entry.dose;
  // Long-press-free: the small ⋯ holds the rarer choices (skip, undo).
  const more = () =>
    sheet({
      title: `${medication.name} · ${formatClock24(entry.at)}`,
      options: open
        ? [
            { label: rx.take, run: () => void take(entry).then((ok) => ok && toast(rx.markedTaken(medication.name))) },
            { label: rx.skip, run: () => void skip(entry) }
          ]
        : [{ label: rx.undo, run: () => void undo(entry) }]
    });
  return (
    <View style={[styles.row, first && { borderTopWidth: 0 }]}>
      <Text style={[styles.time, state === "due" && { color: colors.accent }, state === "missed" && { color: colors.dangerOnShell }]}>{formatClock24(entry.at)}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[type.rowTitle, !open && { color: colors.inkMuted }]} numberOfLines={2}>
          {medication.name}
        </Text>
        <View style={styles.meta}>
          <Badge tone={TONES[state]} glyph={GLYPHS[state]}>
            {rx.states[state]}
          </Badge>
          {medication.dose ? <Text style={type.rowSubtitle}>{medication.dose}</Text> : null}
        </View>
      </View>
      {open ? <RowButton label={rx.take} onPress={() => void take(entry).then((ok) => ok && toast(rx.markedTaken(medication.name)))} /> : null}
      <RowButton outline icon="more-horizontal" label={rx.options} onPress={more} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  time: { width: 48, fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMuted, writingDirection: "ltr" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }
});
