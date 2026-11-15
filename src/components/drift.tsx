import Feather from "@expo/vector-icons/Feather";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Link, router, type Href } from "expo-router";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { FadeIn, usePop } from "@/components/motion";
import { colors, fonts, labelCase, lineHeights, radius, space, textSize, type Color } from "@/components/theme";
import { digits, formatNumber, isArabic, t } from "@/lib/i18n";
import { barHeights, ringRotations } from "@/lib/ring";

// Refined's building blocks. Icons are named in Feather's set; on iOS each draws as its SF Symbol, elsewhere (and for a
// name without one) as the Feather glyph. Layout flips by itself in RTL; only direction-carrying icons (chevrons,
// arrows) need the flip below. Those use the fixed-direction symbols (chevron.right), which iOS does not mirror itself.

export type IconName = ComponentProps<typeof Feather>["name"];

const sfSymbols: Partial<Record<IconName, SFSymbol>> = {
  activity: "waveform.path.ecg",
  "alert-circle": "exclamationmark.circle",
  "alert-triangle": "exclamationmark.triangle",
  "arrow-right": "arrow.right",
  "bar-chart-2": "chart.bar",
  bell: "bell",
  bookmark: "bookmark",
  briefcase: "briefcase",
  calendar: "calendar",
  camera: "camera",
  check: "checkmark",
  "check-circle": "checkmark.circle",
  "chevron-down": "chevron.down",
  "chevron-left": "chevron.left",
  "chevron-right": "chevron.right",
  "chevron-up": "chevron.up",
  clock: "clock",
  coffee: "cup.and.saucer",
  cpu: "cpu",
  "credit-card": "creditcard",
  delete: "delete.left",
  "edit-3": "pencil",
  eye: "eye",
  "eye-off": "eye.slash",
  feather: "pencil.line",
  film: "film",
  globe: "globe",
  grid: "square.grid.2x2",
  hash: "number",
  heart: "heart",
  home: "house",
  layers: "square.3.layers.3d",
  link: "link",
  lock: "lock",
  "map-pin": "mappin",
  maximize: "arrow.up.left.and.arrow.down.right",
  "message-circle": "bubble.left",
  phone: "phone",
  star: "star.fill",
  mic: "mic",
  minus: "minus",
  moon: "moon",
  "more-horizontal": "ellipsis",
  "pie-chart": "chart.pie",
  play: "play",
  plus: "plus",
  "plus-square": "plus.square",
  "refresh-cw": "arrow.clockwise",
  repeat: "repeat",
  "rotate-ccw": "arrow.counterclockwise",
  search: "magnifyingglass",
  settings: "gearshape",
  sliders: "slider.horizontal.3",
  smartphone: "iphone",
  smile: "face.smiling",
  square: "square",
  sun: "sun.max",
  tool: "wrench.adjustable",
  "trash-2": "trash",
  "trending-down": "chart.line.downtrend.xyaxis",
  "trending-up": "chart.line.uptrend.xyaxis",
  truck: "car",
  tv: "tv",
  "user-plus": "person.badge.plus",
  watch: "applewatch",
  x: "xmark",
  zap: "bolt"
};

export function Icon({ name, size = 16, color = colors.inkMuted }: { name: IconName; size?: number; color?: Color }) {
  const symbol = process.env.EXPO_OS === "ios" ? sfSymbols[name] : undefined;
  if (symbol) return <SymbolView name={symbol} size={size} tintColor={color} weight="medium" accessibilityElementsHidden importantForAccessibility="no" />;
  return <Feather name={name} size={size} color={color} />;
}

// Press feedback: a control dims while it is held. pressFade is for a Pressable's style; inside Link asChild (whose Slot
// drops a style function), the Pressable's children take the pressed state and dim themselves.
export const pressedFade = { opacity: 0.7 } as const;
export const pressFade = ({ pressed }: { pressed: boolean }) => (pressed ? pressedFade : null);

export const flip: ViewStyle | null = isArabic ? { transform: [{ scaleX: -1 }] } : null;

export function Chevron({ color = colors.inkFaint, size = 18 }: { color?: Color; size?: number }) {
  return (
    <View style={flip}>
      <Icon name="chevron-right" size={size} color={color} />
    </View>
  );
}

const canGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Real Liquid Glass, for what floats: the tab bar, back and header buttons, sheets, the toast. Never on content cards, and never inside overflow: hidden. */
export function Glass({ tint, interactive, style, children }: { tint?: Color; interactive?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setSolid);
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setSolid);
    return () => subscription.remove();
  }, []);
  if (canGlass && !solid) {
    return (
      <GlassView colorScheme="auto" tintColor={tint} isInteractive={interactive} style={[{ borderCurve: "continuous" }, style]}>
        {children}
      </GlassView>
    );
  }
  return <View style={[{ borderCurve: "continuous", backgroundColor: colors.glassSolid }, style]}>{children}</View>;
}

// True inside a card, so shared pieces (empty states, text) pick the right colors.
const OnSurface = createContext(false);
export const useOnSurface = () => useContext(OnSurface);

/** A section that folds away: tap its header to show or hide it. `summary` stays in the header while it is closed. */
export type Fold = { open: boolean; onToggle: () => void; summary?: string };

/** A card: a lifted surface with a hairline edge and round corners, a sentence-case title, and an action at its end.
 * `list` is a card that holds only divided rows (More, Settings): no inner padding top and bottom, so the rows
 * reach its edges, and give the top row `first` so no line sits above it. */
export function Card({ title, action, children, style, fold, list }: { title?: string; action?: ReactNode; children?: ReactNode; style?: ViewStyle; fold?: Fold; list?: boolean }) {
  const header = fold ? (
    <Pressable
      onPress={fold.onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: fold.open }}
      accessibilityLabel={[title, fold.summary].filter(Boolean).join(", ")}
      hitSlop={6}
      style={({ pressed }) => [styles.cardHeader, styles.foldHeader, pressed && { opacity: 0.7 }]}
    >
      <Text style={[type.cardTitle, { flex: 1 }]}>{title}</Text>
      {action}
      {fold.summary ? <Text style={type.barValue}>{fold.summary}</Text> : null}
      <Icon name={fold.open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />
    </Pressable>
  ) : title || action ? (
    <View style={styles.cardHeader}>
      <Text style={[type.cardTitle, { flex: 1 }]}>{title}</Text>
      {action}
    </View>
  ) : null;
  return (
    <OnSurface.Provider value>
      <View style={[styles.card, list && styles.listCard, fold && !fold.open && { paddingBottom: space.md }, style]}>
        {header}
        {!fold ? children : fold.open ? <FadeIn style={styles.foldBody}>{children}</FadeIn> : null}
      </View>
    </OnSurface.Provider>
  );
}

/** Hero (prayer, readiness, completion, recovery, car): a card with a sand edge. */
export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.hero, style]}>{children}</View>;
}

/** Outlined sand "Tasks ›" pill in a card's header. */
export function CardLink({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" hitSlop={8}>
        {({ pressed }) => (
          <View style={[styles.cardLink, pressed && pressedFade]}>
            <Text style={type.link}>{label}</Text>
            <Chevron size={14} color={colors.link} />
          </View>
        )}
      </Pressable>
    </Link>
  );
}

/** A divided row in a card. It wraps instead of truncating. Rows that navigate end in a chevron. */
export function ListRow({
  leading,
  title,
  titleExtra,
  subtitle,
  meta,
  badges,
  trailing,
  href,
  onPress,
  chevron,
  first
}: {
  first?: boolean; // top row of a card with no title, so it needs no divider
  leading?: ReactNode;
  title: string;
  titleExtra?: string;
  subtitle?: string | null;
  meta?: string;
  badges?: ReactNode;
  trailing?: ReactNode;
  href?: Href;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <View style={[styles.row, first && { borderTopWidth: 0 }]}>
      {leading}
      <View style={{ flex: 1, gap: space.xs }}>
        <Text style={type.rowTitle}>
          {title}
          {titleExtra ? <Text style={type.rowSubtitle}> {titleExtra}</Text> : null}
        </Text>
        {badges || subtitle ? (
          <View style={styles.rowMeta}>
            {badges}
            {subtitle ? <Text style={type.rowSubtitle}>{subtitle}</Text> : null}
          </View>
        ) : null}
      </View>
      {meta ? <Text style={type.rowValue}>{digits(meta)}</Text> : null}
      {trailing}
      {chevron || href ? <Chevron /> : null}
    </View>
  );
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link">{({ pressed }) => <View style={pressed ? pressedFade : undefined}>{body}</View>}</Pressable>
      </Link>
    );
  }
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Square icon well, used as a ListRow's leading slot. */
export function IconTile({ name, size = 32, tone = "neutral" }: { name: IconName; size?: number; tone?: "neutral" | "accent" | "urgent" }) {
  const palette = { neutral: [colors.surfaceInset, colors.ink], accent: [colors.accentTint, colors.accentTintInk], urgent: [colors.urgent, colors.urgentInk] }[tone];
  return (
    <View style={[styles.iconTile, { width: size, height: size, backgroundColor: palette[0] }]}>
      <View style={name === "arrow-right" ? flip : null}>
        <Icon name={name} size={size / 2} color={palette[1]} />
      </View>
    </View>
  );
}

/** Circle with initials (people, account). */
export function Avatar({ name, size = 40, dark }: { name: string; size?: number; dark?: boolean }) {
  return (
    <View style={[styles.iconTile, { width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? colors.urgent : colors.surfaceInset }]}>
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.38, color: dark ? colors.urgentInk : colors.ink }}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export type BadgeTone = "neutral" | "accent" | "urgent" | "success";
// Small filled tags: urgent is pale with dark text, accent is a dark sand tint, the rest sit in the inset well.
// The glyph and label carry the meaning, not the colour.
const badgeTones: Record<BadgeTone, { backgroundColor: Color; borderColor: Color; color: Color }> = {
  neutral: { backgroundColor: colors.surfaceInset, borderColor: colors.surfaceInset, color: colors.inkMuted },
  accent: { backgroundColor: colors.accentTint, borderColor: colors.accentTint, color: colors.accentTintInk },
  urgent: { backgroundColor: colors.urgent, borderColor: colors.urgent, color: colors.urgentInk },
  success: { backgroundColor: colors.successTint, borderColor: colors.successTint, color: colors.success }
};

/** Small label: glyph + text, so status never relies on color alone. */
export function Badge({ tone = "neutral", glyph, children }: { tone?: BadgeTone; glyph?: string; children: string | number }) {
  const { backgroundColor, borderColor, color } = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor, borderColor }]}>
      <Text style={[type.badge, { color }]} numberOfLines={1}>
        {glyph ? `${glyph} ` : ""}
        {digits(children)}
      </Text>
    </View>
  );
}

// The app's lib code says danger / warning / success / neutral.
export function toneToBadge(tone?: string | null): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "accent";
  if (tone === "success") return "success";
  return "neutral";
}

export function toneGlyph(tone?: string | null) {
  if (tone === "danger") return "!";
  if (tone === "warning") return "△";
  if (tone === "success") return "✓";
  return "○";
}

/** Number over label. Tappable when it has an href; a dot marks one that needs attention. */
export function StatTile({ label, value, unit, color = colors.ink, href, alert, size = 20 }: { label: string; value: string | number; unit?: string; color?: Color; href?: Href; alert?: boolean; size?: number }) {
  const body = (
    <View style={styles.tile}>
      <Text style={[type.stat, { color, fontSize: size }]} numberOfLines={1} adjustsFontSizeToFit>
        {digits(value)}
        {unit ? <Text style={type.hint}> {unit}</Text> : null}
      </Text>
      <Text style={type.tileLabel}>{label}</Text>
      {alert ? <View style={styles.tileDot} /> : null}
    </View>
  );
  return href ? (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" style={{ flex: 1 }}>
        {({ pressed }) => <View style={[{ flex: 1 }, pressed && pressedFade]}>{body}</View>}
      </Pressable>
    </Link>
  ) : (
    <View style={{ flex: 1 }}>{body}</View>
  );
}

/** Rows of `columns` equal tiles; a short last row keeps tile width. */
export function StatGrid({ children, columns = 4 }: { children: ReactNode[]; columns?: number }) {
  const rows: ReactNode[][] = [];
  children.forEach((child, index) => {
    if (index % columns === 0) rows.push([]);
    rows[rows.length - 1].push(child);
  });
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: "row", gap: space.sm }}>
          {row}
          {Array.from({ length: columns - row.length }, (_, spacer) => (
            <View key={spacer} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Ring colors for a gauge sitting on a Hero. */
export const heroRing = { color: colors.accent, track: colors.surfaceInset, hole: colors.heroHole, labelColor: colors.heroInk };

/** Label over number, plain (inside heroes and summary cards). */
export function Metric({ label, value, unit, onLime }: { label: string; value: string | number; unit?: string; onLime?: boolean }) {
  return (
    <View style={{ gap: space.xxs }}>
      <Text style={[type.tileLabel, onLime && { color: colors.accentMuted }]}>{label}</Text>
      <Text style={[type.metric, onLime && { color: colors.heroInk }]}>
        {digits(value)}
        {unit ? <Text style={[type.hint, onLime && { color: colors.accentMuted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

/** Ring gauge (0-1), drawn from clipped half-discs so it needs no SVG. Clockwise in both directions, like the design. */
export function RingGauge({
  value,
  size = 64,
  thickness = 8,
  label,
  sublabel,
  color = colors.accent,
  track = colors.surfaceInset,
  hole = colors.ringHole,
  labelColor = colors.ink
}: {
  value: number;
  size?: number;
  thickness?: number;
  label?: string;
  sublabel?: string;
  color?: Color;
  track?: Color;
  hole?: Color;
  labelColor?: Color;
}) {
  const { right, left } = ringRotations(value);
  const half = size / 2;
  const disc = { position: "absolute", top: 0, width: half, height: size, backgroundColor: color } as const;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`} style={{ width: size, height: size, borderRadius: half, backgroundColor: track, direction: "ltr" }}>
      <View style={{ position: "absolute", left: half, width: half, height: size, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: -half, width: size, height: size, transform: [{ rotate: `${right}deg` }] }}>
          <View style={[disc, { left: 0, borderTopLeftRadius: half, borderBottomLeftRadius: half }]} />
        </View>
      </View>
      <View style={{ position: "absolute", left: 0, width: half, height: size, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: 0, width: size, height: size, transform: [{ rotate: `${left}deg` }] }}>
          <View style={[disc, { left: half, borderTopRightRadius: half, borderBottomRightRadius: half }]} />
        </View>
      </View>
      <View style={[styles.ringHole, { top: thickness, left: thickness, right: thickness, bottom: thickness, borderRadius: half - thickness, backgroundColor: hole }]}>
        {label ? <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.22, color: labelColor }}>{digits(label)}</Text> : null}
        {sublabel ? <Text style={{ fontFamily: fonts.medium, fontSize: textSize.caption2, color: labelColor }}>{digits(sublabel)}</Text> : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, max = 100, color = colors.accent, height = 6 }: { value: number; max?: number; color?: Color; height?: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={[styles.track, { height }]}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}

/** "Label ... actual / goal" over a bar. */
export function GoalBar({ label, value, goal, percent, color }: { label: string; value: string; goal?: string | null; percent: number; color?: Color }) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <Text style={type.barLabel}>{label}</Text>
        <Text style={type.barValue}>
          {digits(value)}
          {goal ? <Text style={type.rowSubtitle}> / {digits(goal)}</Text> : null}
        </Text>
      </View>
      <ProgressBar value={percent} color={color} />
    </View>
  );
}

/** Small bar chart. Pass labels for a caption under each bar. */
export function TrendBars({ values, labels, height = 80, label, color = colors.accent, gap = 6, highlight }: { values: number[]; labels?: string[]; height?: number; label: string; color?: Color; gap?: number; highlight?: number }) {
  const heights = barHeights(values);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ height, flexDirection: "row", alignItems: "flex-end", gap }}>
      {heights.map((pct, index) => (
        <View key={index} style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: space.xs }}>
          <View style={{ width: "100%", flexShrink: 1, height: `${pct}%`, minHeight: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: index === highlight ? colors.ink : color }} />
          {labels ? <Text style={type.axis}>{digits(labels[index])}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Round check with a 2px pale ring; checked fills pale with a dark mark. The mark (a shape) shows the state, not only the color.
 * Ticking it fills it at once with a small pop and a tap of haptics, then runs onPress a moment later, so the tick is seen
 * before the row moves away. */
export function CheckItem({ checked, onPress, label, size = 28, ring = colors.ink }: { checked: boolean; onPress: () => void | Promise<unknown>; label: string; size?: number; ring?: Color }) {
  const [ticking, setTicking] = useState(false);
  const { scale, pop } = usePop();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const shown = checked || ticking;
  const press = () => {
    if (timer.current) return;
    pop();
    void Haptics.selectionAsync().catch(() => undefined);
    if (checked) return void onPress();
    setTicking(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      // If the row is still here once the work is done (it failed, or it stays ticked), the fill follows `checked` again.
      void Promise.resolve(onPress())
        .catch(() => undefined)
        .finally(() => setTicking(false));
    }, 180);
  };
  return (
    <Pressable onPress={press} accessibilityRole="checkbox" accessibilityState={{ checked: shown }} accessibilityLabel={label} hitSlop={8}>
      <Animated.View style={[styles.check, { width: size, height: size, borderRadius: size / 2, borderColor: ring, transform: [{ scale }] }, shown && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
        {shown ? <Icon name="check" size={size / 2} color={colors.urgentInk} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** The small count beside a card's title ("3"). Sand when it counts something late. */
export function CountBadge({ value, alert }: { value: number; alert?: boolean }) {
  return <Text style={[styles.count, alert && { color: colors.accentTintInk, backgroundColor: colors.accentTint }]}>{formatNumber(value)}</Text>;
}

/** The ⋯ button that opens a row's action sheet. */
export function MoreButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.moreButton, pressed && pressedFade]}>
      <Icon name="more-horizontal" size={16} color={colors.ink} />
    </Pressable>
  );
}

/** A row's direct action: Paid, Bought, Contacted, Start. Pale with dark text; outline is the quieter version. */
export function RowButton({ label, onPress, outline, icon, disabled }: { label?: string; onPress: () => void; outline?: boolean; icon?: IconName; disabled?: boolean }) {
  const fg = outline ? colors.ink : colors.urgentInk;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.rowButton, outline ? { borderColor: colors.hairline } : { borderColor: colors.urgent, backgroundColor: colors.urgent }, !label && { width: 36, paddingHorizontal: 0 }, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}>
      {icon ? <Icon name={icon} size={15} color={fg} /> : null}
      {label && !(icon && outline) ? <Text style={[type.pill, { fontFamily: fonts.semibold, color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

/** An empty section: an icon, one line saying what goes here, and a way to add the first one. `action` is the add button;
 * with only an `example`, the button opens the assistant empty and the example under it opens it with that line typed in. */
export function EmptyState({ example, children, icon, action }: { example?: string; children?: string; icon?: IconName; action?: { label: string; onPress: () => void } | false }) {
  const onSurface = useOnSurface();
  const add = action === false ? null : (action ?? (example ? { label: t.add, onPress: () => router.push("/capture") } : null));
  return (
    <FadeIn style={styles.empty}>
      {icon ? <IconTile name={icon} size={44} /> : null}
      {children ? <Text style={[onSurface ? type.rowSubtitle : type.shellMuted, { textAlign: "center" }]}>{children}</Text> : null}
      {add ? <RowButton icon="plus" label={add.label} onPress={add.onPress} /> : null}
      {example ? (
        // The example is a starting line: tap it and the assistant opens with it typed in.
        <Pressable onPress={() => router.push({ pathname: "/capture", params: { text: example } })} accessibilityRole="button" accessibilityLabel={example} hitSlop={8} style={pressFade}>
          <Text style={[type.code, styles.exampleLink]}>{example} ↗</Text>
        </Pressable>
      ) : null}
    </FadeIn>
  );
}

/** Big screen title on the dark background. */
export function PageTitle({ children }: { children: string }) {
  return (
    <Text style={type.h1} accessibilityRole="header">
      {children}
    </Text>
  );
}

export const type = StyleSheet.create({
  // Screen titles: big, semibold, sentence case.
  h1: { fontFamily: fonts.semibold, fontSize: textSize.title1, lineHeight: lineHeights.title1, letterSpacing: -0.45, color: colors.onShell },
  h2: { fontFamily: fonts.semibold, fontSize: textSize.headline, lineHeight: lineHeights.headline, color: colors.ink },
  title: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, lineHeight: lineHeights.subheadline, color: colors.ink },
  // A card's title: 15px semibold, sentence case.
  cardTitle: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, lineHeight: lineHeights.subheadline, color: colors.ink },
  // Small group labels: 12px uppercase, a little tracking, muted.
  sectionLabel: { fontFamily: fonts.semibold, fontSize: textSize.caption1, lineHeight: lineHeights.caption1, color: colors.inkMuted, ...labelCase },
  link: { fontFamily: fonts.medium, fontSize: textSize.caption1, color: colors.link, letterSpacing: isArabic ? 0 : 0.7 },
  stat: { fontFamily: fonts.semibold, fontSize: textSize.title3, color: colors.ink },
  metric: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, color: colors.ink },
  tileLabel: { fontFamily: fonts.medium, fontSize: textSize.caption2, lineHeight: lineHeights.caption2, color: colors.inkMuted },
  hint: { fontFamily: fonts.regular, fontSize: textSize.caption2, color: colors.inkMuted },
  body: { fontFamily: fonts.regular, fontSize: textSize.subheadline, lineHeight: lineHeights.subheadline, color: colors.ink },
  rowTitle: { fontFamily: fonts.medium, fontSize: textSize.subheadline, lineHeight: lineHeights.subheadline, color: colors.ink },
  rowSubtitle: { fontFamily: fonts.regular, fontSize: textSize.caption1, lineHeight: lineHeights.caption1, color: colors.inkMuted },
  rowValue: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, color: colors.ink },
  barLabel: { fontFamily: fonts.medium, fontSize: textSize.subheadline, color: colors.ink },
  barValue: { fontFamily: fonts.semibold, fontSize: textSize.subheadline, color: colors.ink },
  axis: { fontFamily: fonts.regular, fontSize: textSize.caption2, color: colors.inkMuted },
  badge: { fontFamily: fonts.semibold, fontSize: textSize.caption2 },
  pill: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.ink },
  code: { fontFamily: fonts.regular, fontSize: textSize.caption1, color: colors.ink, backgroundColor: colors.surfaceInset, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.xs, overflow: "hidden" },
  shellMeta: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.onShellMuted },
  shellMuted: { fontFamily: fonts.regular, fontSize: textSize.footnote, lineHeight: lineHeights.footnote, color: colors.onShellMuted },
  shellLabel: { fontFamily: fonts.semibold, fontSize: textSize.caption1, color: colors.onShellMuted, ...labelCase }
});

const styles = StyleSheet.create({
  // paddingVertical, not paddingTop/paddingBottom: in React Native the longhand always wins, so a screen's
  // paddingVertical would be ignored.
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, borderCurve: "continuous", paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  // Rows only: they bring their own height, so no padding above the first or below the last.
  listCard: { paddingVertical: 0, gap: 0, overflow: "hidden" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 32 },
  // A folding header is a tap target, so it gets a finger's height.
  foldHeader: { minHeight: 36 },
  cardLink: { flexDirection: "row", alignItems: "center", gap: space.xxs, minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.accentLine },
  hero: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: space.lg, paddingHorizontal: space.lg, backgroundColor: colors.hero, borderWidth: 1, borderColor: colors.heroEdge, borderRadius: radius.card, borderCurve: "continuous" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.surfaceInset },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  iconTile: { borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: radius.badge, borderWidth: 1, paddingHorizontal: space.sm, paddingVertical: space.xxs },
  tile: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, borderCurve: "continuous", paddingHorizontal: space.md, paddingVertical: space.md, gap: space.xs, minHeight: 72 },
  tileDot: { position: "absolute", top: space.sm, end: space.sm, width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.urgent },
  ringHole: { position: "absolute", alignItems: "center", justifyContent: "center" },
  track: { width: "100%", borderRadius: radius.pill, backgroundColor: colors.surfaceInset, overflow: "hidden" },
  check: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  moreButton: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.edge, alignItems: "center", justifyContent: "center" },
  rowButton: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  empty: { alignItems: "center", gap: space.md, paddingVertical: space.lg },
  foldBody: { gap: space.sm },
  count: { fontFamily: fonts.semibold, fontSize: textSize.caption2, color: colors.inkMuted, backgroundColor: colors.surfaceInset, paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.badge, overflow: "hidden" },
  exampleLink: { color: colors.link }
});
