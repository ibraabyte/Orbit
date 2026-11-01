import Feather from "@expo/vector-icons/Feather";
import { Link, type Href } from "expo-router";
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, fonts, radius } from "@/components/theme";
import { barHeights, ringRotations } from "@/lib/ring";

// Drift's building blocks, ported from the web version's src/components/ui (tag web-final).
// Icons are Feather, the set the web's lucide icons were forked from.

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = 16, color = colors.inkMuted }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

// True inside a cream card, so shared pieces (empty states, text) pick the right colors.
const OnSurface = createContext(false);
export const useOnSurface = () => useContext(OnSurface);

/** Cream card: 22px radius, hairline border, optional title / kicker / action header. */
export function Card({ title, kicker, action, children, style }: { title?: string; kicker?: string; action?: ReactNode; children?: ReactNode; style?: ViewStyle }) {
  return (
    <OnSurface.Provider value>
      <View style={[styles.card, style]}>
        {title || action ? (
          <View style={styles.cardHeader}>
            <View style={{ flex: 1, gap: 3 }}>
              {title ? <Text style={type.title}>{title}</Text> : null}
              {kicker ? <Text style={type.meta}>{kicker}</Text> : null}
            </View>
            {action}
          </View>
        ) : null}
        {children}
      </View>
    </OnSurface.Provider>
  );
}

/** Ghost icon button for a card's header (e.g. open the full page). */
export function CardAction({ icon, href, label }: { icon: IconName; href: Href; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={8} style={styles.cardAction}>
        <Icon name={icon} size={16} color={colors.ink} />
      </Pressable>
    </Link>
  );
}

export function Stack({ children, gap = 6 }: { children: ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

/** List row: a hairline tile with leading slot, title + subtitle, meta text and trailing slot. */
export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  href,
  onPress,
  chevron
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: string;
  trailing?: ReactNode;
  href?: Href;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const body = (
    <View style={styles.row}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? <Text style={type.rowMeta}>{meta}</Text> : null}
      {trailing}
      {chevron ? <Icon name="chevron-right" size={18} /> : null}
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
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => (pressed ? { opacity: 0.8 } : null)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Square icon well, used as a ListRow's leading slot (More, settings). */
export function IconTile({ name }: { name: IconName }) {
  return (
    <View style={styles.iconTile}>
      <Icon name={name} size={18} color={colors.accentDeep} />
    </View>
  );
}

export type BadgeTone = "neutral" | "accent" | "urgent" | "success" | "warning";
const badgeTones: Record<BadgeTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.surfaceInset, color: colors.inkMuted },
  accent: { backgroundColor: colors.accent, color: colors.accentInk },
  urgent: { backgroundColor: colors.urgent, color: colors.urgentInk },
  success: { backgroundColor: colors.successTint, color: colors.successInk },
  warning: { backgroundColor: colors.warningTint, color: colors.warningInk }
};

/** Pill label. Always text, so status never relies on color alone. */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: string | number }) {
  const { backgroundColor, color } = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[type.badge, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

// The app's lib code says danger / warning / success / neutral; badges say urgent / warning / success / neutral.
export function toneToBadge(tone?: string | null): BadgeTone {
  if (tone === "danger") return "urgent";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}

export type StatTone = "neutral" | "accent" | "success" | "urgent";
const statColors: Record<StatTone, string> = { neutral: colors.ink, accent: colors.accentDeep, success: colors.successDeep, urgent: colors.urgent };

export function StatTile({ label, value, hint, icon, tone = "neutral" }: { label: string; value: string | number; hint?: string; icon?: IconName; tone?: StatTone }) {
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Icon name={icon} size={15} /> : null}
      </View>
      <Text style={[type.stat, { color: statColors[tone] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text style={type.hint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Two tiles per row, like the web's grid-cols-2. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Ring gauge (0-1), drawn from clipped half-discs so it needs no SVG. Sits on a cream card. */
export function RingGauge({ value, size = 84, thickness = 10, label, sublabel, color = colors.accentDeep }: { value: number; size?: number; thickness?: number; label?: string; sublabel?: string; color?: string }) {
  const { right, left } = ringRotations(value);
  const half = size / 2;
  const disc = { position: "absolute", top: 0, width: half, height: size, backgroundColor: color } as const;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${Math.round(Math.max(0, Math.min(1, value)) * 100)} percent`} style={{ width: size, height: size, borderRadius: half, backgroundColor: colors.track }}>
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
      <View style={[styles.ringHole, { top: thickness, left: thickness, right: thickness, bottom: thickness, borderRadius: half - thickness }]}>
        {label ? <Text style={type.title}>{label}</Text> : null}
        {sublabel ? <Text style={type.label}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, max = 100, color = colors.accentDeep }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} style={styles.track}>
      <View style={{ width: `${pct}%`, height: "100%", borderRadius: radius.pill, backgroundColor: color }} />
    </View>
  );
}

/** Small bar chart (completed minutes per day, etc.). */
export function TrendBars({ values, height = 128, label }: { values: number[]; height?: number; label: string }) {
  const heights = barHeights(values);
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 3 }}>
      {heights.map((pct, index) => (
        <View key={index} style={{ flex: 1, height: `${pct}%`, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.accentDeep, opacity: 0.75 }} />
      ))}
    </View>
  );
}

/** Lime circle with a check mark; the mark (a shape) shows the state, not only the color. */
export function CheckItem({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} hitSlop={8} style={[styles.check, checked && styles.checkOn]}>
      {checked ? <Icon name="check" size={14} color={colors.accentInk} /> : null}
    </Pressable>
  );
}

/** Dashed cream well on a card; plain muted text on the dark background. */
export function EmptyState({ title, children }: { title?: string; children?: string }) {
  const onSurface = useOnSurface();
  if (!onSurface) return <Text style={type.shellMuted}>{children ?? title}</Text>;
  return (
    <View style={styles.empty}>
      {title ? <Text style={type.rowTitle}>{title}</Text> : null}
      {children ? <Text style={[type.rowSubtitle, { textAlign: "center" }]}>{children}</Text> : null}
    </View>
  );
}

/** Big title on the dark background, muted subtitle, optional row of pill buttons. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={type.h1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={type.shellMeta}>{subtitle}</Text> : null}
      </View>
      {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View> : null}
    </View>
  );
}

/** Small pill button that links somewhere (PageHeader toolbars). primary is lime. */
export function PillLink({ href, icon, label, primary, onPress }: { href?: Href; icon?: IconName; label: string; primary?: boolean; onPress?: () => void }) {
  const fg = primary ? colors.accentInk : colors.ink;
  const body = (
    <>
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text style={[type.pill, { color: fg }]}>{label}</Text>
    </>
  );
  const style = StyleSheet.flatten([styles.pill, { backgroundColor: primary ? colors.accent : colors.surface }]);
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" style={style}>
          {body}
        </Pressable>
      </Link>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      {body}
    </Pressable>
  );
}

/** The lime "O" mark + Orbit wordmark from the web's top bar. */
export function Brand({ size = 28 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="header" accessibilityLabel="Orbit">
      <View style={[styles.brandMark, { width: size, height: size, borderRadius: size * 0.36 }]}>
        <Text style={[type.brandGlyph, { fontSize: size * 0.55 }]}>O</Text>
      </View>
      <Text style={[type.brandWord, { fontSize: size * 0.6 }]}>Orbit</Text>
    </View>
  );
}

// Type scale, from the web's --text-* tokens.
export const type = StyleSheet.create({
  h1: { fontFamily: fonts.bold, fontSize: 25, lineHeight: 28, color: colors.onShell },
  h2: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 24, color: colors.ink },
  title: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, color: colors.ink },
  meta: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.inkMuted },
  label: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: colors.inkMuted },
  stat: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink },
  hint: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkMuted },
  body: { fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 21, color: colors.ink },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  rowSubtitle: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.inkMuted },
  rowMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkMuted },
  badge: { fontFamily: fonts.semibold, fontSize: 11 },
  pill: { fontFamily: fonts.semibold, fontSize: 12 },
  shellMeta: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17, color: colors.onShellMuted },
  shellMuted: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.onShellMuted },
  shellLabel: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", color: colors.onShellMuted },
  brandGlyph: { fontFamily: fonts.bold, color: colors.accentInk },
  brandWord: { fontFamily: fonts.bold, color: colors.onShell }
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 16, gap: 6 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 6 },
  cardAction: { width: 32, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.tile, paddingHorizontal: 12, paddingVertical: 10 },
  iconTile: { width: 36, height: 36, borderRadius: radius.tile, backgroundColor: colors.surfaceInset, alignItems: "center", justifyContent: "center" },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 140 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderColor: colors.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.tile, padding: 12, gap: 4 },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  ringHole: { position: "absolute", backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 2 },
  track: { height: 8, width: "100%", borderRadius: radius.pill, backgroundColor: colors.track, overflow: "hidden" },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  empty: { alignItems: "center", gap: 6, borderRadius: radius.tile, borderWidth: 1, borderStyle: "dashed", borderColor: colors.hairline, backgroundColor: colors.surfaceInset, paddingHorizontal: 16, paddingVertical: 24 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: radius.pill },
  brandMark: { backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }
});
