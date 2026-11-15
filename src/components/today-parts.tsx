import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/drift";
import { colors, fonts, radius, space, textSize, type Color } from "@/components/theme";
import { digits, formatClock24, formatIn, isArabic } from "@/lib/i18n";
import { prayerNamesEn, type PrayerTime } from "@/lib/prayer-times";

const prayerName = (prayer: PrayerTime) => (isArabic ? prayer.label : prayerNamesEn[prayer.name]);

/** A white card with a title and a small grey note at the other end. */
export function Panel({ title, note, children, href }: { title?: string; note?: string; children: ReactNode; href?: Href }) {
  const body = (
    <>
      {title ? (
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>{title}</Text>
          {note ? <Text style={styles.note}>{digits(note)}</Text> : null}
        </View>
      ) : null}
      {children}
    </>
  );
  return href ? (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.panel, pressed && { opacity: 0.8 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.panel}>{body}</View>
  );
}

/** The five prayers on one line: past ones filled, the next one a ring, the rest quiet. */
export function PrayerStrip({ prayers, next, now }: { prayers: PrayerTime[]; next: PrayerTime | null; now: Date }) {
  const passed = prayers.filter((prayer) => prayer.at <= now).length;
  const share = prayers.length > 1 ? Math.min(1, Math.max(0, (passed - 1) / (prayers.length - 1))) : 0;
  return (
    <Panel title={next ? `${prayerName(next)} ${formatIn(Math.max(0, Math.round((next.at.getTime() - now.getTime()) / 60_000)))}` : undefined} note={next ? formatClock24(next.at) : undefined}>
      <View style={styles.strip}>
        <View style={styles.stripLine} />
        <View style={[styles.stripLine, styles.stripDone, { width: `${share * 84}%` }]} />
        {prayers.map((prayer) => {
          const done = prayer.at <= now;
          const isNext = next?.name === prayer.name && !done;
          return (
            <View key={prayer.name} style={styles.stripItem} accessible accessibilityLabel={`${prayerName(prayer)} ${formatClock24(prayer.at)}`}>
              <View style={[styles.dot, done && styles.dotDone, isNext && styles.dotNext]} />
              <Text style={[styles.stripName, (done || isNext) && { color: colors.ink }, isNext && { fontFamily: fonts.bold }]}>{prayerName(prayer)}</Text>
              <Text style={styles.stripTime}>{formatClock24(prayer.at)}</Text>
            </View>
          );
        })}
      </View>
    </Panel>
  );
}

/** Bars for a week, today last. Only `highlight` is dark; with no highlight every bar is. */
export function Bars({ values, height = 44, highlight, color = colors.urgent, labels }: { values: number[]; height?: number; highlight?: number; color?: Color; labels?: string[] }) {
  const top = Math.max(...values, 0) || 1;
  return (
    <View style={{ direction: "ltr" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bars, { height }]}>
        {values.map((value, index) => (
          <View key={index} style={styles.barSlot}>
            <View style={[styles.bar, { height: Math.max(4, (value / top) * height), backgroundColor: !value ? colors.surfaceInset : highlight === undefined || highlight === index ? color : colors.hairline }]} />
          </View>
        ))}
      </View>
      {labels ? (
        <View style={styles.bars}>
          {labels.map((label, index) => (
            <Text key={index} style={[styles.barSlot, styles.barLabel]}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** One square on the 2×2 grid: a name, a big number and a small chart. */
export function StatBox({ label, value, unit, href, children }: { label: string; value: string; unit?: string; href?: Href; children?: ReactNode }) {
  return (
    <Pressable onPress={href ? () => router.push(href) : undefined} disabled={!href} accessibilityRole={href ? "button" : undefined} accessibilityLabel={`${label}: ${value} ${unit ?? ""}`} style={({ pressed }) => [styles.panel, styles.stat, pressed && { opacity: 0.8 }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValue}>
        <Text style={styles.statNumber} numberOfLines={1} adjustsFontSizeToFit>
          {digits(value)}
        </Text>
        {unit ? <Text style={styles.note}>{digits(unit)}</Text> : null}
      </View>
      {children}
    </Pressable>
  );
}

export function StatGrid2({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** A thin bar filled to `share` (0–1). */
export function Meter({ share, color = colors.accent }: { share: number; color?: Color }) {
  return (
    <View style={styles.meter}>
      <View style={[styles.meterFill, { width: `${Math.min(1, Math.max(0, share)) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Pills you tap: dark once done. */
export function Pills({ items }: { items: { key: string; label: string; on: boolean; onPress?: () => void }[] }) {
  return (
    <View style={styles.pills}>
      {items.map((item) => (
        <Pressable key={item.key} onPress={item.onPress} disabled={!item.onPress} accessibilityRole="checkbox" accessibilityState={{ checked: item.on }} accessibilityLabel={item.label} style={({ pressed }) => [styles.pill, item.on && styles.pillOn, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.pillText, item.on && { color: colors.urgentInk }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export type TimelineItem = { id: string; at: Date; title: string; subtitle?: string; icon: IconName; state: "done" | "now" | "later"; href?: Href; nowLabel: string };

/** The day top to bottom: time, a dot on one line, what it is. Done is dark, the current one sand. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <View>
      <View style={styles.tlLine} />
      {items.map((item) => {
        const done = item.state === "done";
        const ring = done ? colors.urgent : item.state === "now" ? colors.accent : colors.hairline;
        return (
          <Pressable key={item.id} onPress={item.href ? () => router.push(item.href!) : undefined} disabled={!item.href} accessibilityLabel={`${formatClock24(item.at)} ${item.title}`} style={styles.tlRow}>
            <Text style={styles.tlTime}>{formatClock24(item.at)}</Text>
            <View style={[styles.tlDot, { borderColor: ring, backgroundColor: done ? colors.urgent : colors.surface }]}>
              <Icon name={item.icon} size={13} color={done ? colors.urgentInk : item.state === "now" ? colors.accentDeep : colors.inkFaint} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.tlTitleRow}>
                <Text style={[styles.tlTitle, done && { color: colors.inkMuted }, item.state === "now" && { fontFamily: fonts.semibold }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.state === "now" ? <Text style={styles.nowTag}>{item.nowLabel}</Text> : null}
              </View>
              {item.subtitle ? <Text style={styles.note}>{digits(item.subtitle)}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small squares in a row: what is coming up (a bill, a paper, the car). */
export function AheadTiles({ items }: { items: { id: string; icon: IconName; title: string; when: string; href: Href }[] }) {
  return (
    <View style={styles.ahead}>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => router.push(item.href)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.when}`} style={({ pressed }) => [styles.aheadTile, pressed && { opacity: 0.7 }]}>
          <View style={styles.aheadIcon}>
            <Icon name={item.icon} size={16} color={colors.accentDeep} />
          </View>
          <Text style={styles.aheadTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.note} numberOfLines={1}>
            {digits(item.when)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, padding: space.lg, borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  panelTitle: { fontFamily: fonts.semibold, fontSize: textSize.callout, color: colors.ink },
  note: { fontFamily: fonts.regular, fontSize: textSize.caption1, color: colors.inkMuted },
  strip: { flexDirection: "row", justifyContent: "space-between" },
  // The line runs between the first and last dot (each item is 16% wide, its dot in the middle).
  stripLine: { position: "absolute", top: 6, start: "8%", end: "8%", height: 2, backgroundColor: colors.surfaceInset },
  stripDone: { end: undefined, backgroundColor: colors.urgent },
  stripItem: { width: "16%", alignItems: "center", gap: 4 },
  dot: { width: 12, height: 12, marginTop: 1, borderRadius: 6, backgroundColor: colors.surfaceInset },
  dotDone: { backgroundColor: colors.urgent },
  dotNext: { width: 14, height: 14, marginTop: 0, borderRadius: 7, borderWidth: 3, borderColor: colors.urgent, backgroundColor: colors.surface },
  stripName: { fontFamily: fonts.medium, fontSize: textSize.caption1, color: colors.inkMuted },
  stripTime: { fontFamily: fonts.regular, fontSize: textSize.caption2, color: colors.inkMuted },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  barSlot: { flex: 1, alignItems: "center" },
  bar: { width: "70%", borderRadius: 4 },
  barLabel: { textAlign: "center", fontFamily: fonts.regular, fontSize: textSize.caption2, color: colors.inkMuted, paddingTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  stat: { flexBasis: "47%", flexGrow: 1, maxWidth: "49%", gap: space.xs, padding: space.md },
  statLabel: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.ink },
  statValue: { flexDirection: "row", alignItems: "baseline", gap: space.xs },
  statNumber: { fontFamily: fonts.bold, fontSize: textSize.title2, color: colors.ink, writingDirection: "ltr" },
  meter: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.surfaceInset, marginTop: space.sm },
  meterFill: { height: 8, borderRadius: 4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceInset },
  pillOn: { backgroundColor: colors.urgent },
  pillText: { fontFamily: fonts.medium, fontSize: textSize.footnote, color: colors.inkMuted },
  tlLine: { position: "absolute", top: 18, bottom: 18, start: 44 + space.md + 13, width: 2, backgroundColor: colors.surfaceInset },
  tlRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: 6 },
  tlTime: { width: 44, paddingTop: 5, fontFamily: fonts.regular, fontSize: textSize.caption1, color: colors.inkMuted, writingDirection: "ltr", textAlign: "left" },
  tlDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tlTitleRow: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingTop: 3 },
  tlTitle: { flexShrink: 1, fontFamily: fonts.regular, fontSize: textSize.subheadline, color: colors.ink },
  nowTag: { overflow: "hidden", paddingHorizontal: 8, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.accentTint, color: colors.accentTintInk, fontFamily: fonts.semibold, fontSize: textSize.caption2 },
  ahead: { flexDirection: "row", gap: space.sm },
  aheadTile: { flex: 1, minWidth: 0, gap: 6, padding: space.md, borderRadius: radius.tile, borderCurve: "continuous", backgroundColor: colors.surfaceInset },
  aheadIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  aheadTitle: { fontFamily: fonts.semibold, fontSize: textSize.footnote, color: colors.ink }
});
