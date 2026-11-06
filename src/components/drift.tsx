import Feather from "@expo/vector-icons/Feather";
import { Link, router, type Href } from "expo-router";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, labelCase, radius } from "@/components/theme";
import { isArabic } from "@/lib/i18n";
import { barHeights, ringRotations } from "@/lib/ring";

// Drift's building blocks. Icons are Feather. Layout flips by itself in RTL; only
// direction-carrying icons (chevrons) need the flip below.

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = 16, color = colors.inkMuted }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

export const flip: ViewStyle | null = isArabic ? { transform: [{ scaleX: -1 }] } : null;

export function Chevron({ color = colors.inkFaint, size = 18 }: { color?: string; size?: number }) {
  return (
    <View style={flip}>
      <Icon name="chevron-right" size={size} color={color} />
    </View>
  );
}

const canGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Real Liquid Glass, for what floats: the tab bar, back and header buttons, sheets, the toast. Never on content cards, and never inside overflow: hidden. */
export function Glass({ tint, interactive, style, children }: { tint?: string; interactive?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setSolid);
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setSolid);
    return () => subscription.remove();
  }, []);
  if (canGlass && !solid) {
    return (
      <GlassView colorScheme="dark" tintColor={tint} isInteractive={interactive} style={[{ borderCurve: "continuous" }, style]}>
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

/** A section on the black ground: a hairline on top, a small uppercase title, and an action at its end. No box. */
export function Card({ title, action, children, style, fold }: { title?: string; action?: ReactNode; children?: ReactNode; style?: ViewStyle; fold?: Fold }) {
  const header = fold ? (
    <Pressable
      onPress={fold.onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: fold.open }}
      accessibilityLabel={[title, fold.summary].filter(Boolean).join(", ")}
      hitSlop={6}
      style={({ pressed }) => [styles.cardHeader, styles.foldHeader, pressed && { opacity: 0.7 }]}
    >
      <Text style={[type.sectionLabel, { flex: 1 }]}>{title}</Text>
      {action}
      {fold.summary ? <Text style={type.barValue}>{fold.summary}</Text> : null}
      <Icon name={fold.open ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />
    </Pressable>
  ) : title || action ? (
    <View style={styles.cardHeader}>
      <Text style={[type.sectionLabel, { flex: 1 }]}>{title}</Text>
      {action}
    </View>
  ) : null;
  return (
    <OnSurface.Provider value>
      <View style={[styles.card, fold && !fold.open && { paddingBottom: 10 }, style]}>
        {header}
        {!fold || fold.open ? children : null}
      </View>
    </OnSurface.Provider>
  );
}

/** Hero (prayer, readiness, completion, recovery, car): one big number on the ground, no fill. */
export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.hero, style]}>{children}</View>;
}

/** Green "Tasks ›" link in a card's header. */
export function CardLink({ href, label }: { href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" hitSlop={8} style={styles.cardLink}>
        <Text style={type.link}>{label}</Text>
        <Chevron size={15} color={colors.link} />
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
      <View style={{ flex: 1, gap: 3 }}>
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
      {meta ? <Text style={type.rowValue}>{meta}</Text> : null}
      {trailing}
      {chevron || href ? <Chevron /> : null}
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
// Outlined pills; only urgent is filled (pale, black text). The glyph and label carry the meaning, not the colour.
const badgeTones: Record<BadgeTone, { backgroundColor: string; borderColor: string; color: string }> = {
  neutral: { backgroundColor: "transparent", borderColor: colors.hairline, color: colors.inkMuted },
  accent: { backgroundColor: "transparent", borderColor: colors.accent, color: colors.accent },
  urgent: { backgroundColor: colors.urgent, borderColor: colors.urgent, color: colors.urgentInk },
  success: { backgroundColor: "transparent", borderColor: colors.hairline, color: colors.success }
};

/** Small label: glyph + text, so status never relies on color alone. */
export function Badge({ tone = "neutral", glyph, children }: { tone?: BadgeTone; glyph?: string; children: string | number }) {
  const { backgroundColor, borderColor, color } = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor, borderColor }]}>
      <Text style={[type.badge, { color }]} numberOfLines={1}>
        {glyph ? `${glyph} ` : ""}
        {children}
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
export function StatTile({ label, value, unit, color = colors.ink, href, alert, size = 20 }: { label: string; value: string | number; unit?: string; color?: string; href?: Href; alert?: boolean; size?: number }) {
  const body = (
    <View style={styles.tile}>
      <Text style={[type.stat, { color, fontSize: size }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={type.hint}> {unit}</Text> : null}
      </Text>
      <Text style={type.tileLabel}>{label}</Text>
      {alert ? <View style={styles.tileDot} /> : null}
    </View>
  );
  return href ? (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" style={{ flex: 1 }}>
        {body}
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
    <View style={{ gap: 8 }}>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: "row", gap: 8 }}>
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
    <View style={{ gap: 1 }}>
      <Text style={[type.tileLabel, onLime && { color: colors.accentMuted }]}>{label}</Text>
      <Text style={[type.metric, onLime && { color: colors.heroInk }]}>
        {value}
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
  color?: string;
  track?: string;
  hole?: string;
  labelColor?: string;
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
        {label ? <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.22, color: labelColor }}>{label}</Text> : null}
        {sublabel ? <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: labelColor }}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, max = 100, color = colors.accent, height = 6 }: { value: number; max?: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={[styles.track, { height }]}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}

/** "Label ... actual / goal" over a bar. */
export function GoalBar({ label, value, goal, percent, color }: { label: string; value: string; goal?: string | null; percent: number; color?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={type.barLabel}>{label}</Text>
        <Text style={type.barValue}>
          {value}
          {goal ? <Text style={type.rowSubtitle}> / {goal}</Text> : null}
        </Text>
      </View>
      <ProgressBar value={percent} color={color} />
    </View>
  );
}

/** Small bar chart. Pass labels for a caption under each bar. */
export function TrendBars({ values, labels, height = 80, label, color = colors.accent, gap = 6, highlight }: { values: number[]; labels?: string[]; height?: number; label: string; color?: string; gap?: number; highlight?: number }) {
  const heights = barHeights(values);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ height, flexDirection: "row", alignItems: "flex-end", gap }}>
      {heights.map((pct, index) => (
        <View key={index} style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
          <View style={{ width: "100%", flexShrink: 1, height: `${pct}%`, minHeight: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: index === highlight ? colors.ink : color }} />
          {labels ? <Text style={type.axis}>{labels[index]}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Round check with a 2px ink ring. The mark (a shape) shows the state, not only the color. */
export function CheckItem({ checked, onPress, label, size = 28, ring = colors.ink }: { checked: boolean; onPress: () => void; label: string; size?: number; ring?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} hitSlop={8} style={[styles.check, { width: size, height: size, borderRadius: size / 2, borderColor: ring }, checked && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      {checked ? <Icon name="check" size={size / 2} color={colors.accentInk} /> : null}
    </Pressable>
  );
}

/** The ⋯ button that opens a row's action sheet. */
export function MoreButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.moreButton}>
      <Icon name="more-horizontal" size={16} color={colors.ink} />
    </Pressable>
  );
}

/** A row's direct action: Paid, Bought, Contacted, Start. A sand outline; outline is the quieter grey version. */
export function RowButton({ label, onPress, outline, icon, disabled }: { label?: string; onPress: () => void; outline?: boolean; icon?: IconName; disabled?: boolean }) {
  const fg = outline ? colors.ink : colors.accent;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} style={({ pressed }) => [styles.rowButton, { borderColor: outline ? colors.hairline : colors.accent }, !label && { width: 36, paddingHorizontal: 0 }, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}>
      {icon ? <Icon name={icon} size={15} color={fg} /> : null}
      {label && !(icon && outline) ? <Text style={[type.pill, { color: fg }]}>{label}</Text> : null}
    </Pressable>
  );
}

/** Teaches a section by example: "Nothing here yet. Try: `pay rent fri 5pm !high`". */
export function EmptyState({ example, children, icon }: { example?: string; children?: string; icon?: IconName }) {
  const onSurface = useOnSurface();
  return (
    <View style={styles.empty}>
      {icon ? <IconTile name={icon} size={48} /> : null}
      {children ? <Text style={[onSurface ? type.rowSubtitle : type.shellMuted, { textAlign: "center" }]}>{children}</Text> : null}
      {example ? (
        // The example is a starting line: tap it and the assistant opens with it typed in.
        <Pressable onPress={() => router.push({ pathname: "/capture", params: { text: example } })} accessibilityRole="button" accessibilityLabel={example} hitSlop={8}>
          <Text style={[type.code, styles.exampleLink]}>{example} ↗</Text>
        </Pressable>
      ) : null}
    </View>
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

/** Round Orbit mark on an ink tile (sign in). */
export function Brand({ size = 56 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.29, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" }} accessibilityRole="image" accessibilityLabel="Orbit">
      <View style={{ width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, borderWidth: 3, borderColor: colors.accent }} />
    </View>
  );
}

export const type = StyleSheet.create({
  h1: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: colors.onShell },
  h2: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: colors.ink },
  title: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.ink },
  // Section titles: 11px uppercase, wide tracking, muted.
  sectionLabel: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, color: colors.inkMuted, ...labelCase },
  link: { fontFamily: fonts.medium, fontSize: 12, color: colors.link, ...labelCase },
  stat: { fontFamily: fonts.medium, fontSize: 20, color: colors.ink },
  metric: { fontFamily: fonts.medium, fontSize: 17, color: colors.ink },
  // Tighter tracking than other labels: four tiles share a phone row, and "REMINDERS" must not break mid-word.
  tileLabel: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 14, color: colors.inkMuted, ...labelCase, letterSpacing: isArabic ? 0 : 0.5 },
  hint: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkMuted },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.ink },
  rowTitle: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink },
  rowSubtitle: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, color: colors.inkMuted },
  rowValue: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  barLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  barValue: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  axis: { fontFamily: fonts.regular, fontSize: 10, color: colors.inkMuted, ...labelCase },
  badge: { fontFamily: fonts.medium, fontSize: 10, ...labelCase },
  pill: { fontFamily: fonts.medium, fontSize: 11, color: colors.ink, ...labelCase },
  code: { fontFamily: fonts.regular, fontSize: 12, color: colors.ink, backgroundColor: colors.surfaceInset, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  shellMeta: { fontFamily: fonts.regular, fontSize: 11, color: colors.onShellMuted, ...labelCase },
  shellMuted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.onShellMuted },
  shellLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.onShellMuted, ...labelCase }
});

const styles = StyleSheet.create({
  card: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.hairline, paddingTop: 14, paddingBottom: 4, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 24 },
  // A folding header is a tap target, so it gets a finger's height.
  foldHeader: { minHeight: 36 },
  cardLink: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  hero: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.hairline },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  iconTile: { borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 1 },
  tile: { flex: 1, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, borderCurve: "continuous", paddingHorizontal: 8, paddingVertical: 10, gap: 4, minHeight: 64 },
  tileDot: { position: "absolute", top: 8, end: 8, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  ringHole: { position: "absolute", alignItems: "center", justifyContent: "center" },
  track: { width: "100%", borderRadius: radius.pill, backgroundColor: colors.surfaceInset, overflow: "hidden" },
  check: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  moreButton: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  rowButton: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 16 },
  exampleLink: { color: colors.accent, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.hairline }
});
