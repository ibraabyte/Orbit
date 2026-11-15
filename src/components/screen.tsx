import { router, Stack, usePathname } from "expo-router";
import SegmentedControl from "@expo/ui/community/segmented-control";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SearchBarCommands } from "react-native-screens";
import { Animated, Easing, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, Icon, PageTitle, type, useOnSurface } from "@/components/drift";
import { useReduceMotion } from "@/components/motion";
import { colors, fonts, radius, space, textSize, usePalette, useScheme, type Palette } from "@/components/theme";
import { et } from "@/lib/exercises";
import { ht } from "@/lib/health-hub";
import { isArabic, t } from "@/lib/i18n";
import { mt } from "@/lib/seerr";
import { contentWidth, showsSidebar } from "@/lib/sidebar";
import { dx } from "@/lib/documents";
import { tx } from "@/lib/travel";
import { rx } from "@/lib/medications";
import { mx } from "@/lib/maps";
import { sx } from "@/lib/shipments";
import { st } from "@/lib/subscriptions";
import { pt } from "@/lib/plan";
import { tt } from "@/lib/training";

// Space the tab bar takes at the bottom of a tab screen.
export const TAB_BAR_SPACE = 120;

// Widest the content column grows on iPad, so cards and rows keep a readable width.
export const CONTENT_MAX_WIDTH = 760;
// A screen laid out in two columns (Today) may grow wider.
const WIDE_MAX_WIDTH = 1180;

/** True on an iPad-sized window, where the sidebar replaces the tab bar. */
export function useSidebar() {
  const { width, height } = useWindowDimensions();
  return showsSidebar(width, height);
}

/** True when the room beside the sidebar is wide enough to show two columns side by side. */
export function useWide() {
  const { width, height } = useWindowDimensions();
  return contentWidth(width, height) >= 900;
}

/** Two columns side by side on iPad; on a phone, left then right in one column, so the order stays the same. */
export function Columns({ left, right }: { left: ReactNode; right: ReactNode }) {
  if (!useWide()) {
    return (
      <>
        {left}
        {right}
      </>
    );
  }
  return (
    <View style={styles.columns}>
      <View style={styles.columnHalf}>{left}</View>
      <View style={styles.columnHalf}>{right}</View>
    </View>
  );
}

// Stack screens: their title and the example line on the capture bar. Each opens on its own, with no row of
// other sections across the top, so a section only shows its own things.
const stackScreens: Record<string, { title: string; hint?: string }> = {
  "/tasks": { title: t.tasks, hint: "pay rent fri 5pm +home · pack; passport; charger" },
  "/health": { title: t.health, hint: "weight 82 · slept 7h q4 · workout 40m run" },
  "/health-goals": { title: ht.goals },
  "/whoop": { title: t.whoop },
  "/twilio": { title: "Twilio" },
  "/food": { title: t.food, hint: "buy milk · plan dinner salmon @friday" },
  "/food-add": { title: t.addFood },
  "/food-scan": { title: t.scanBarcode },
  "/food-photo": { title: t.platePhoto },
  "/finance": { title: t.finance, hint: "lunch 45 · subscription netflix 45" },
  "/accounts": { title: t.moneyPlaces },
  "/investments": { title: t.investments },
  "/cards": { title: t.cards },
  "/obligations": { title: t.obligations },
  "/subscriptions": { title: st.title },
  "/library": { title: t.library },
  "/habits": { title: t.habits, hint: "habit read 20 min daily" },
  "/vehicles": { title: t.car },
  "/documents": { title: dx.documents },
  "/shipments": { title: sx.shipments },
  "/maps": { title: mx.maps },
  "/travel": { title: tx.travel },
  "/media": { title: t.movies },
  "/requests": { title: mt.requests },
  "/ask": { title: t.askOrbit },
  "/settings": { title: t.settings },
  "/notifications": { title: t.notifications },
  "/integrations": { title: t.integrations },
  "/ai-features": { title: t.pv.advanced },
  "/exercises": { title: et.exercises },
  "/gym": { title: et.gym },
  "/injuries": { title: et.injuries },
  "/training": { title: tt.workouts },
  "/workout": { title: tt.workout },
  "/workout-pick": { title: tt.pickExercise },
  "/body": { title: tt.measurements },
  "/plan": { title: pt.plan },
  "/plan-day": { title: pt.plan },
  "/plan-setup": { title: pt.edit },
  "/medications": { title: rx.medications }
};

// voice: start listening as soon as it opens (a hold on the Orbit button).
export function openCapture(text?: string, voice = false) {
  router.push({ pathname: "/capture", params: { ...(text ? { text } : {}), ...(voice ? { voice: "1" } : {}) } });
}

/** The title a stack route shows in its native header, from its path ("/tasks"). */
export function stackTitle(path: string) {
  return stackScreens[path]?.title ?? (path.startsWith("/exercises/") ? et.exercises : path.startsWith("/task/") ? t.task : undefined);
}

// The black ground behind everything. Tab screens pass header; stack screens get the native header (title from the
// route, set in src/app/_layout.tsx) and their capture hint at the top. On a wide screen (iPad) the content sits in a
// centered column, so cards and rows keep a readable width.
export function Screen({
  header,
  title,
  wide,
  stackAction,
  search,
  banner,
  refreshing,
  onRefresh,
  children
}: {
  header?: ReactNode;
  title?: string; // a stack screen whose title depends on what it shows (a genre, a person)
  wide?: boolean; // the screen uses Columns, so it may grow past the usual column width
  stackAction?: { label: string; onPress: () => void };
  search?: ScreenSearch; // a native search field in the header, under the large title
  banner?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const palette = usePalette();
  // On a stack screen the spinner only answers a pull. Shown for a load the screen starts itself, iOS shifts the content
  // under the large title and leaves a gap; that load shows its own loading state instead. Tab screens are unchanged.
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    if (!refreshing) setPulled(false);
  }, [refreshing]);
  const searchBar = useRef<SearchBarCommands>(null);
  // The header field keeps its own text; a query that arrives with the screen (a link) is written into it once.
  const initialQuery = useRef(search?.value);
  useEffect(() => {
    if (initialQuery.current) searchBar.current?.setText(initialQuery.current);
  }, []);
  // Tab screens leave room for the floating tab bar; beside the iPad sidebar there is none.
  const sidebar = useSidebar();
  const stack = !header;
  const bottom = header && !sidebar ? TAB_BAR_SPACE : space.huge;
  const hint = stack ? stackScreens[path]?.hint : undefined;
  // The ScrollView comes first, so the native large title collapses as it scrolls; on iOS it insets itself under the
  // header and above the home indicator.
  // In Arabic React Native mirrors a right-to-left scroll view (scale -1) and mirrors its content back. iOS 26 puts the
  // large title inside the scroll view beside that content, so it was mirrored once and drew backwards (after a pull to
  // refresh too). So the scroll view itself stays left to right (no mirroring) and its content runs right to left.
  const scroll = (
    <ScrollView
      style={[styles.shell, { direction: "ltr" }]}
      contentInsetAdjustmentBehavior={stack ? "automatic" : "never"}
      contentContainerStyle={[styles.content, styles.column, { direction: isArabic ? "rtl" : "ltr" }, wide && { maxWidth: WIDE_MAX_WIDTH }, { paddingTop: stack || banner ? space.sm : insets.top + space.sm, paddingBottom: bottom }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={(pulled || !stack) && Boolean(refreshing)}
            onRefresh={() => {
              setPulled(true);
              onRefresh();
            }}
            tintColor={colors.onShellMuted}
          />
        ) : undefined
      }
    >
      {header}
      {hint ? <CaptureHint hint={hint} /> : null}
      {children}
    </ScrollView>
  );
  if (stack) {
    return (
      <>
        {scroll}
        <Stack.Screen
          options={{
            ...(title !== undefined && { title }),
            ...headerAction(stackAction, palette),
            ...(search && {
              headerSearchBarOptions: {
                ref: searchBar,
                placeholder: search.placeholder,
                placement: "stacked",
                hideWhenScrolling: false, // the same as set in src/app/_layout.tsx
                autoCapitalize: "none",
                tintColor: palette.link,
                textColor: palette.ink,
                onChangeText: (event) => search.onChangeText(event.nativeEvent.text),
                onSearchButtonPress: (event) => search.onSubmit?.(event.nativeEvent.text),
                onCancelButtonPress: () => search.onChangeText("")
              }
            })
          }}
        />
      </>
    );
  }
  return (
    <View style={styles.shell}>
      {banner ? <View style={{ paddingTop: insets.top }}>{banner}</View> : null}
      {scroll}
    </View>
  );
}

type ScreenSearch = { placeholder: string; value: string; onChangeText: (text: string) => void; onSubmit?: (text: string) => void };

// A stack screen's one action (Save, Finish): a native bar button in sand on iOS, a sand pill on Android. Bar button
// colours must be plain strings (a dynamic colour is dropped), so they come from the current palette. (A filled
// "prominent" button ignores the label colour, which leaves white text on light sand in dark mode.)
function headerAction(action: { label: string; onPress: () => void } | undefined, palette: Palette) {
  if (!action) return { unstable_headerRightItems: () => [], headerRight: undefined };
  if (process.env.EXPO_OS === "ios") {
    return {
      unstable_headerRightItems: () => [
        { type: "button" as const, label: action.label, onPress: action.onPress, tintColor: palette.link, labelStyle: { fontFamily: fonts.semibold } }
      ]
    };
  }
  return {
    headerRight: () => (
      <Pressable onPress={action.onPress} accessibilityRole="button" style={({ pressed }) => [styles.stackAction, pressed && { opacity: 0.8 }]}>
        <Text style={[type.pill, { fontFamily: fonts.semibold, color: colors.accentInk }]}>{action.label}</Text>
      </Pressable>
    )
  };
}

/** Dashed bar with the sand + and an example line for this section; opens Capture. */
export function CaptureHint({ hint }: { hint: string }) {
  return (
    <Pressable onPress={() => openCapture()} accessibilityRole="button" accessibilityLabel={t.capture} style={({ pressed }) => [styles.hint, pressed && { opacity: 0.7 }]}>
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

/** Small control beside a tab title (Customize, Settings): a card-coloured button with a hairline edge. With an icon it shows the icon before the label. */
export function HeaderButton({ label, icon, onPress }: { label: string; icon?: "sliders" | "settings"; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]}>
      {icon ? <Icon name={icon} size={15} color={colors.ink} /> : null}
      <Text style={[type.pill, { color: colors.ink }]}>{label}</Text>
    </Pressable>
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

/** A group's label above its card, lined up with the text inside the card, with an optional small link at the end ("Edit"). */
export function GroupHeader({ label, action }: { label: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.groupHeader}>
      <Text style={[type.shellLabel, { flexShrink: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label} ${label}`} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={type.link}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
    <View style={{ gap: space.lg }} accessibilityLabel={t.loading}>
      <View style={{ flexDirection: "row" }}>{block(72)}</View>
      <View style={{ flexDirection: "row", gap: space.md }}>
        {block(70, radius.tile)}
        {block(70, radius.tile)}
      </View>
      <View style={{ flexDirection: "row" }}>{block(180)}</View>
      <Text style={[type.shellMuted, { textAlign: "center" }]}>{t.loading}…</Text>
    </View>
  );
}

// The system segmented control (UISegmentedControl on iOS, Material buttons on Android). small keeps the old call sites
// compiling; native segments always span the row.
export function Segments<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (next: T) => void; labels?: Record<T, string>; small?: boolean }) {
  const scheme = useScheme();
  return (
    <SegmentedControl
      values={options.map((option) => (labels ? labels[option] : option))}
      selectedIndex={Math.max(0, options.indexOf(value))}
      onChange={(event) => {
        const next = options[event.nativeEvent.selectedSegmentIndex];
        if (next === undefined || next === value) return;
        if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync().catch(() => undefined);
        onChange(next);
      }}
      appearance={scheme}
      style={styles.segments}
    />
  );
}

// primary: sand with black text. dark: pale with black text. outline: clear with a hairline edge.
export function Button({ title, onPress, disabled, variant = "dark" }: { title: string; onPress: () => void; disabled?: boolean; variant?: "primary" | "dark" | "outline" }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.button, buttonStyles[variant], disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.buttonText, { color: variant === "primary" ? colors.accentInk : variant === "dark" ? colors.urgentInk : colors.ink }]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input({ style, ...props }: TextInputProps) {
  const onSurface = useOnSurface();
  return <TextInput placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} style={[ui.input, onSurface && { backgroundColor: colors.field }, style]} {...props} />;
}

/** The ⌕ field in a card-coloured bar (Library, Movies). */
export function SearchBar(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={16} color={colors.inkFaint} />
      <TextInput placeholderTextColor={colors.inkFaint} selectionColor={colors.accentDeep} returnKeyType="search" clearButtonMode="while-editing" style={styles.searchInput} {...props} />
    </View>
  );
}

/** The Trail logo in sand, turning head-first: it fades in (a quick load never flashes it), then turns a full circle,
 * easing in and out so each turn breathes. With Reduce Motion it only glows softly in place. */
export function Loading() {
  const reduce = useReduceMotion();
  const turn = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const appear = Animated.timing(shown, { toValue: 1, duration: 260, delay: 120, useNativeDriver: true });
    const loop = reduce
      ? Animated.loop(
          Animated.sequence([
            Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(turn, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
          ])
        )
      : Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    appear.start();
    loop.start();
    return () => {
      appear.stop();
      loop.stop();
    };
  }, [turn, shown, reduce]);
  const motion = reduce
    ? { opacity: Animated.multiply(shown, turn.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] })) }
    : { opacity: shown, transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] };
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel={t.loading} style={[{ alignSelf: "center" }, motion]}>
      <Image source={require("../../assets/brand/night/symbol-sand-1024.png")} style={{ width: 32, height: 32 }} />
    </Animated.View>
  );
}

export const ui = StyleSheet.create({
  error: { fontFamily: fonts.medium, fontSize: textSize.subheadline, color: colors.dangerOnShell },
  input: { minWidth: 0, minHeight: 48, backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: 1, borderRadius: radius.tile, borderCurve: "continuous", paddingHorizontal: space.lg, fontSize: textSize.callout, fontFamily: fonts.medium, color: colors.ink }
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  dark: { backgroundColor: colors.urgent },
  outline: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.hairline }
});

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.shell },
  content: { paddingHorizontal: space.xl, gap: space.lg },
  column: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
  columnHalf: { flex: 1, minWidth: 0, gap: space.lg },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 20, paddingHorizontal: space.xs },
  tabHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, paddingTop: space.xs, paddingBottom: space.xxs },
  headerButton: { minHeight: 44, minWidth: 44, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderRadius: radius.tile, borderCurve: "continuous", borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  stackAction: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  segments: { minHeight: 36 },
  bleed: { marginHorizontal: -space.xl, flexGrow: 0 },
  bleedContent: { paddingHorizontal: space.xl, gap: space.sm },
  hint: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.hairline, backgroundColor: colors.surface, borderRadius: radius.tile, borderCurve: "continuous" },
  hintMark: { width: 22, height: 22, borderRadius: radius.badge, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  hintText: { flex: 1, fontFamily: fonts.regular, fontSize: textSize.caption1, color: colors.inkFaint },
  offline: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.urgent, paddingHorizontal: space.xl, paddingVertical: space.sm },
  offlineDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  offlineText: { flex: 1, fontFamily: fonts.medium, fontSize: textSize.caption1, color: colors.urgentInk },
  error: { alignItems: "center", gap: space.lg, paddingHorizontal: space.md, paddingVertical: space.giant },
  errorMark: { width: 56, height: 56, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.urgent, alignItems: "center", justifyContent: "center" },
  errorGlyph: { fontFamily: fonts.semibold, fontSize: textSize.title1, color: colors.urgentInk },
  button: { minHeight: 50, borderRadius: radius.card, borderCurve: "continuous", paddingHorizontal: space.xl, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: fonts.semibold, fontSize: textSize.callout },
  search: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, borderRadius: radius.tile, borderCurve: "continuous" },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: textSize.subheadline, color: colors.ink, minHeight: 44 }
});
