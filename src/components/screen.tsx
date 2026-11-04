import { router, usePathname } from "expo-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, flip, Glass, Icon, PageTitle, type, useOnSurface } from "@/components/drift";
import { backdrop, colors, fonts, radius } from "@/components/theme";
import { t } from "@/lib/i18n";

// Space the tab bar takes at the bottom of a tab screen.
export const TAB_BAR_SPACE = 120;

// Stack screens: their title and the example line on the capture bar. Each opens on its own, with no row of
// other sections across the top, so a section only shows its own things.
const stackScreens: Record<string, { title: string; hint?: string }> = {
  "/tasks": { title: t.tasks, hint: "pay rent fri 5pm !high" },
  "/health": { title: t.health, hint: "slept 7h q4 · workout 40m run" },
  "/whoop": { title: t.whoop },
  "/food": { title: t.food, hint: "buy milk · plan dinner salmon @friday" },
  "/finance": { title: t.finance, hint: "غداء 45 · subscription netflix 45" },
  "/accounts": { title: t.moneyPlaces },
  "/investments": { title: t.investments },
  "/cards": { title: t.cards },
  "/obligations": { title: t.obligations },
  "/people": { title: t.people, hint: "person Faisal friend" },
  "/library": { title: t.library, hint: "note idea for the weekend" },
  "/habits": { title: t.habits, hint: "habit read 20 min daily" },
  "/goals": { title: t.goals, hint: "goal run a 10k @2026-12-31" },
  "/journal": { title: t.journal, hint: "journal good today was calm" },
  "/vehicles": { title: t.car },
  "/media": { title: t.movies },
  "/servers": { title: t.servers },
  "/ask": { title: t.askOrbit },
  "/settings": { title: t.settings }
};

export function openCapture(text?: string) {
  router.push({ pathname: "/capture", params: text ? { text } : {} });
}

// Soft forest light behind everything. Tab screens pass header; stack screens get theirs from the route.
export function Screen({
  header,
  stackAction,
  banner,
  refreshing,
  onRefresh,
  children
}: {
  header?: ReactNode;
  stackAction?: { label: string; onPress: () => void };
  banner?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.shell}>
      {banner ? <View style={{ paddingTop: insets.top }}>{banner}</View> : null}
      <ScrollView
        style={styles.fill}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, { paddingTop: banner ? 8 : insets.top + 8, paddingBottom: header ? TAB_BAR_SPACE : 48 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.onShellMuted} /> : undefined}
      >
        {header ?? <StackHeader action={stackAction} />}
        {children}
      </ScrollView>
    </View>
  );
}

function StackHeader({ action }: { action?: { label: string; onPress: () => void } }) {
  const path = usePathname();
  const meta = stackScreens[path];
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.stackBar}>
        <Glass interactive style={styles.backButton}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t.back} style={[styles.glassPress, flip]}>
            <Icon name="chevron-left" size={22} color={colors.ink} />
          </Pressable>
        </Glass>
        <Text style={styles.stackTitle} accessibilityRole="header">
          {meta?.title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" style={styles.stackAction}>
            <Text style={[type.pill, { fontSize: 13, color: colors.accentInk }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {meta?.hint ? <CaptureHint hint={meta.hint} /> : null}
    </View>
  );
}

/** Quiet bar with an example line for this section; opens Capture. */
function CaptureHint({ hint }: { hint: string }) {
  return (
    <Pressable onPress={() => openCapture()} accessibilityRole="button" accessibilityLabel={t.capture} style={styles.hint}>
      <View style={styles.hintMark}>
        <Icon name="plus" size={15} color={colors.accentInk} />
      </View>
      <Text style={styles.hintText} numberOfLines={1}>
        {hint}
      </Text>
    </Pressable>
  );
}

/** Title with an optional line above and a control at the end (tab screens). */
export function TabHeader({ title, kicker, action }: { title: string; kicker?: string; action?: ReactNode }) {
  return (
    <View style={styles.tabHeader}>
      <View style={{ flexShrink: 1 }}>
        {kicker ? <Text style={type.shellMeta}>{kicker}</Text> : null}
        <PageTitle>{title}</PageTitle>
      </View>
      {action}
    </View>
  );
}

/** Small glass control beside a tab title (Customize, language). With an icon it shows only the icon. */
export function HeaderButton({ label, icon, onPress }: { label: string; icon?: "sliders"; onPress: () => void }) {
  return (
    <Glass interactive style={icon ? styles.backButton : styles.headerButton}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.glassPress}>
        {icon ? <Icon name={icon} size={17} color={colors.ink} /> : <Text style={[type.pill, { fontSize: 13, color: colors.ink }]}>{label}</Text>}
      </Pressable>
    </Glass>
  );
}

/** A titled card. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} action={action}>
      {children}
    </Card>
  );
}

/** Group label straight on the dark background (More). */
export function ShellLabel({ children }: { children: string }) {
  return <Text style={type.shellLabel}>{children}</Text>;
}

/** Strip on top: offline, showing the saved copy. */
export function OfflineBanner({ message }: { message: string }) {
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <View style={styles.offlineDot} />
      <Text style={styles.offlineText}>{message}</Text>
    </View>
  );
}

/** Horizontal strip that runs to the screen edges. */
export function BleedRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedContent}>
      {children}
    </ScrollView>
  );
}

/** Full-screen failure with a retry, when there is no saved copy to show. */
export function ErrorState({ detail, onRetry }: { detail?: string | null; onRetry: () => void }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <View style={styles.errorMark}>
        <Text style={styles.errorGlyph}>!</Text>
      </View>
      <Text style={[type.h2, { color: colors.onShell, textAlign: "center" }]}>{t.error}</Text>
      {detail ? <Text style={[type.shellMuted, { textAlign: "center" }]}>{detail}</Text> : null}
      <Button title={t.retry} variant="dark" onPress={onRetry} />
    </View>
  );
}

/** Shimmering placeholder cards while the first load runs. */
export function Skeleton() {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const block = (height: number, radiusValue: number = radius.card) => <Animated.View style={{ flex: 1, height, borderRadius: radiusValue, backgroundColor: colors.surfaceInset, opacity: pulse }} />;
  return (
    <View style={{ gap: 14 }} accessibilityLabel={t.loading}>
      <View style={{ flexDirection: "row" }}>{block(72)}</View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {block(70, radius.tile)}
        {block(70, radius.tile)}
      </View>
      <View style={{ flexDirection: "row" }}>{block(180)}</View>
      <Text style={[type.shellMuted, { textAlign: "center" }]}>{t.loading}…</Text>
    </View>
  );
}

export function Segments<T extends string>({ options, value, onChange, labels, small }: { options: readonly T[]; value: T; onChange: (next: T) => void; labels?: Record<T, string>; small?: boolean }) {
  return (
    <View style={[styles.segments, small && { borderRadius: 9 }]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable key={option} onPress={() => onChange(option)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.segment, small && styles.segmentSmall, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, small && { fontSize: 12 }, { color: selected ? colors.urgentInk : colors.ink }]}>{labels ? labels[option] : option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// primary: lime with dark ink. dark: pale with dark ink. outline: clear with a pale edge.
export function Button({ title, onPress, disabled, variant = "dark" }: { title: string; onPress: () => void; disabled?: boolean; variant?: "primary" | "dark" | "outline" }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.button, buttonStyles[variant], disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.buttonText, { color: variant === "primary" ? colors.accentInk : variant === "dark" ? colors.urgentInk : colors.urgent }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input({ style, ...props }: TextInputProps) {
  const onSurface = useOnSurface();
  return <TextInput placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} style={[ui.input, onSurface && { backgroundColor: colors.field }, style]} {...props} />;
}

/** The ⌕ field on a glass bar (Library, Movies). */
export function SearchBar(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={16} color={colors.inkFaint} />
      <TextInput placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} returnKeyType="search" clearButtonMode="while-editing" style={styles.searchInput} {...props} />
    </View>
  );
}

/** The Trail logo, turning head-first. */
export function Loading() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View accessibilityRole="progressbar" accessibilityLabel={t.loading} style={{ alignSelf: "center", transform: [{ rotate }] }}><Image source={require("../../assets/brand/icons/expo-splash-icon-1024.png")} style={{ width: 32, height: 32 }} /></Animated.View>;
}

export const ui = StyleSheet.create({
  error: { fontFamily: fonts.medium, fontSize: 14, color: colors.dangerOnShell },
  input: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1, borderRadius: radius.tile, paddingHorizontal: 14, fontSize: 16, fontFamily: fonts.medium, color: colors.ink }
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  dark: { backgroundColor: colors.urgent },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.urgent }
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shell: { flex: 1, backgroundColor: colors.shell, experimental_backgroundImage: backdrop },
  content: { paddingHorizontal: 20, gap: 14 },
  tabHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingBottom: 2 },
  headerButton: { height: 44, minWidth: 44, borderRadius: 22 },
  glassPress: { flexGrow: 1, minHeight: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  stackBar: { flexDirection: "row", alignItems: "center", gap: 8 },
  backButton: { width: 44, height: 44, borderRadius: 22 },
  stackTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: colors.onShell },
  stackAction: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  bleed: { marginHorizontal: -20, flexGrow: 0 },
  bleedContent: { paddingHorizontal: 20, gap: 6 },
  hint: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: radius.tile, borderCurve: "continuous" },
  hintMark: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  hintText: { flex: 1, fontFamily: "Menlo", fontSize: 12, color: colors.inkFaint },
  offline: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceInset, paddingHorizontal: 20, paddingVertical: 6 },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  offlineText: { flex: 1, fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  error: { alignItems: "center", gap: 14, paddingHorizontal: 12, paddingVertical: 60 },
  errorMark: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  errorGlyph: { fontFamily: fonts.bold, fontSize: 28, color: colors.urgentInk },
  segments: { flexDirection: "row", backgroundColor: colors.surfaceInset, borderRadius: radius.tile, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  segmentSmall: { flex: 0, minHeight: 32, paddingHorizontal: 12, borderRadius: 7 },
  segmentSelected: { backgroundColor: colors.urgent },
  segmentText: { fontFamily: fonts.bold, fontSize: 14 },
  button: { minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 15 },
  search: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: colors.surface, borderRadius: radius.pill },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, minHeight: 44 }
});
