import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type, type IconName } from "@/components/drift";
import { colors, radius } from "@/components/theme";

/** A filter pill: pale when on, like the section switcher. */
export function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}>
      {icon ? <Icon name={icon} size={14} color={on ? colors.urgentInk : colors.ink} /> : null}
      <Text style={[type.pill, { color: on ? colors.urgentInk : colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The exercise's first photo, or a plain tile while there is none. */
export function ExerciseThumb({ uri, size = 48 }: { uri: string | null; size?: number }) {
  if (!uri) {
    return (
      <View style={[styles.thumb, { width: size, height: size, alignItems: "center", justifyContent: "center" }]}>
        <Icon name="activity" size={18} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} accessibilityIgnoresInvertColors />;
}

const styles = StyleSheet.create({
  chip: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  thumb: { borderRadius: radius.control, backgroundColor: colors.surfaceInset }
});
