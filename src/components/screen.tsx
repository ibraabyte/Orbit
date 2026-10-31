import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Brand, Card, EmptyState, ListRow, PageHeader, StatGrid, StatTile, toneToBadge, useOnSurface, type IconName } from "@/components/drift";
import { colors, fonts, radius } from "@/components/theme";

const tones = { danger: colors.danger, warning: colors.warning, success: colors.success, neutral: colors.inkMuted, default: colors.inkMuted } as const;
export type Tone = keyof typeof tones;

// Space the floating tab bar takes at the bottom of a tab screen.
export const TAB_BAR_SPACE = 120;

// Drift layout: dark forest background; on tab screens the Orbit mark and a page header on top,
// then cream cards. Stack screens (opened from More) omit title: their native header has it.
export function Screen({
  title,
  subtitle,
  actions,
  refreshing,
  onRefresh,
  children
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const scroll = (
    <ScrollView
      style={styles.safe}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { paddingBottom: title ? TAB_BAR_SPACE : 48 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.onShellMuted} /> : undefined}
    >
      {title ? (
        <>
          <Brand />
          <PageHeader title={title} subtitle={subtitle}>
            {actions}
          </PageHeader>
        </>
      ) : null}
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

/** A titled cream card (the web's ModuleCard). Rows, stats and text inside it use the card's colors. */
export function Section({ title, kicker, action, children }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} kicker={kicker} action={action}>
      {children}
    </Card>
  );
}

export type StatItem = readonly [label: string, value: string | number, icon?: IconName, hint?: string];

export function Stats({ items }: { items: readonly StatItem[] }) {
  return (
    <StatGrid>
      {items.map(([label, value, icon, hint]) => (
        <StatTile key={label} label={label} value={value} icon={icon} hint={hint} />
      ))}
    </StatGrid>
  );
}

// tone shows as a small dot; badge as a labelled pill in that tone (never color alone).
export function Row({
  title,
  detail,
  right,
  tone,
  badge,
  onPress,
  href
}: {
  title: string;
  detail?: string | null;
  right?: string;
  tone?: Tone;
  badge?: string;
  onPress?: () => void;
  href?: Href;
}) {
  return (
    <ListRow
      leading={tone && !badge ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tones[tone] }} /> : undefined}
      title={title}
      subtitle={detail}
      meta={right}
      trailing={badge ? <Badge tone={toneToBadge(tone)}>{badge}</Badge> : undefined}
      onPress={onPress}
      href={href}
      chevron={Boolean(href)}
    />
  );
}

// Empty-state text: a dashed well inside a card, muted text on the dark background.
export function Empty({ children }: { children: string }) {
  return <EmptyState>{children}</EmptyState>;
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
  // Inside a card the field is the inset cream, like the web's form controls.
  const onSurface = useOnSurface();
  return <TextInput placeholderTextColor={colors.inkMuted} selectionColor={colors.accentDeep} style={[ui.input, onSurface && { backgroundColor: colors.surfaceInset }, style]} {...props} />;
}

export function Loading() {
  return <ActivityIndicator color={colors.accent} />;
}

// Text and cards on cream.
export const ui = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 16, gap: 4 },
  // A tile inside a card (the web's rounded-tile article).
  tile: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.tile, padding: 12, gap: 4 },
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
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  segments: { flexDirection: "row", backgroundColor: colors.surfaceInset, borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  segmentSelected: { backgroundColor: colors.surface },
  segmentText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted, textTransform: "capitalize" },
  segmentTextSelected: { fontFamily: fonts.semibold, color: colors.ink },
  button: { minHeight: 46, borderRadius: radius.pill, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 16 }
});
