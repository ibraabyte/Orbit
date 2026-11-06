import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type } from "@/components/drift";
import { colors, fonts, radius } from "@/components/theme";

// A wrapping row of choices on the card colour; the chosen one is pale with dark text.
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  onLongPress,
  children
}: {
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
  label: (option: T) => string;
  onLongPress?: (option: T) => void;
  children?: ReactNode; // extra chips at the end, like "+ New list"
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => (
        <Chip key={option} label={label(option)} selected={option === value} onPress={() => onChange(option)} onLongPress={onLongPress ? () => onLongPress(option) : undefined} />
      ))}
      {children}
    </View>
  );
}

export function Chip({ label, selected, onPress, onLongPress, accessibilityLabel }: { label: string; selected?: boolean; onPress: () => void; onLongPress?: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={onLongPress ? "Long press for more" : undefined}
      style={({ pressed }) => [styles.chip, selected && { borderColor: colors.urgent, backgroundColor: colors.urgent }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[type.pill, { fontFamily: fonts.semibold, fontSize: 12, color: selected ? colors.urgentInk : colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 34, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }
});
