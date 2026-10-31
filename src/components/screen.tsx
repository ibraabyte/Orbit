import { Link, type Href } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, radius } from "@/components/theme";

const tones = { danger: colors.danger, warning: colors.warning, success: colors.success, neutral: colors.inkMuted, default: colors.inkMuted } as const;
export type Tone = keyof typeof tones;

// Drift layout: dark forest background, titles and section labels on it, content on cream cards.
// title: large title for tab screens; omit it on stack screens that show a native header.
export function Screen({ title, refreshing, onRefresh, children }: { title?: string; refreshing?: boolean; onRefresh?: () => void; children: ReactNode }) {
  const scroll = (
    <ScrollView
      style={styles.safe}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.onShellMuted} /> : undefined}
    >
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </ScrollView>
  );
  return title ? (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {scroll}
    </SafeAreaView>
  ) : (
    <View style={styles.safe}>{scroll}</View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={shell.label}>{title}</Text>
      {children}
    </View>
  );
}

export function Stats({ items }: { items: readonly (readonly [string, string | number])[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.tile}>
          <Text style={ui.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.stat} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function Row({ title, detail, right, tone, onPress, href }: { title: string; detail?: string | null; right?: string; tone?: Tone; onPress?: () => void; href?: Href }) {
  const body = (
    <View style={[ui.card, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tones[tone] }} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.body}>{title}</Text>
        {detail ? <Text style={ui.muted}>{detail}</Text> : null}
      </View>
      {right ? <Text style={styles.right}>{right}</Text> : null}
    </View>
  );
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link">{body}</Pressable>
      </Link>
    );
  }
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={pressed}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

// Plain text on the dark background (not inside a card).
export function Empty({ children }: { children: string }) {
  return <Text style={shell.muted}>{children}</Text>;
}

export function Segments<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (next: T) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// primary: lime with dark text. secondary: cream. danger: red, for sign out and disconnect.
export function Button({ title, onPress, disabled, variant = "primary" }: { title: string; onPress: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed: down }) => [styles.button, buttonStyles[variant], disabled && { opacity: 0.45 }, down && { opacity: 0.8 }]}
    >
      <Text style={[styles.buttonText, { color: variant === "danger" ? "#fff" : colors.accentInk }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input({ style, ...props }: TextInputProps) {
  return <TextInput placeholderTextColor={colors.inkMuted} selectionColor={colors.accentDeep} style={[ui.input, style]} {...props} />;
}

export function Loading() {
  return <ActivityIndicator color={colors.accent} />;
}

const pressed = ({ pressed: down }: { pressed: boolean }) => (down ? { opacity: 0.85 } : null);

// Text and cards on cream.
export const ui = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 16, gap: 4 },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, color: colors.inkMuted, textTransform: "uppercase" },
  body: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  strong: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted },
  error: { fontFamily: fonts.medium, fontSize: 15, color: colors.dangerOnShell },
  input: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control, padding: 14, fontSize: 16, fontFamily: fonts.medium, color: colors.ink }
});

// Text straight on the dark background.
export const shell = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: 32, color: colors.onShell },
  label: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.6, color: colors.onShellMuted, textTransform: "uppercase" },
  body: { fontFamily: fonts.medium, fontSize: 16, color: colors.onShell },
  muted: { fontFamily: fonts.medium, fontSize: 15, color: colors.onShellMuted }
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface },
  danger: { backgroundColor: colors.danger }
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.shell },
  content: { padding: 18, gap: 16, paddingBottom: 48 },
  title: shell.title,
  tile: { width: "31.5%", backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.tile, padding: 12, gap: 4 },
  stat: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink },
  right: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkMuted },
  segments: { flexDirection: "row", backgroundColor: colors.surfaceInset, borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted, textTransform: "capitalize" },
  segmentTextSelected: { fontFamily: fonts.semibold, color: colors.ink },
  button: { minHeight: 46, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 16 }
});
