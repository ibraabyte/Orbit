import { router } from "expo-router";
import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Badge, Card, Chevron, type } from "@/components/drift";
import { BleedRow, CONTENT_MAX_WIDTH } from "@/components/screen";
import { colors, fonts, radius } from "@/components/theme";
import { mediaBadge, mt, posterUrl, seerrName, seerrYear, type DiscoverList, type SeerrCast, type SeerrMediaType, type SeerrResult, type StatusBadge } from "@/lib/seerr";
import { contentWidth } from "@/lib/sidebar";

// The Movies & TV pieces: posters, poster rows and grids, cast faces. Built from the shared theme only.

export const openTitle = (kind: SeerrMediaType, id: number) => router.push({ pathname: "/title", params: { kind, id: String(id) } });
export const openPerson = (id: number) => router.push({ pathname: "/person", params: { id: String(id) } });
export function openDiscover(list: DiscoverList, name?: string) {
  const params = list.row === "genre" ? { row: list.row, kind: list.kind, genre: String(list.genreId), name: name ?? "" } : { row: list.row };
  router.push({ pathname: "/discover", params });
}

const POSTER_RATIO = 1.5;

/** A TMDB poster, or a block with the title's first letter when there is none. */
export function Poster({ path, title, width, round }: { path?: string | null; title: string; width: number; round?: boolean }) {
  const height = round ? width : width * POSTER_RATIO;
  const uri = posterUrl(path, width > 150 ? 500 : width > 70 ? 342 : 185);
  const shape = { width, height, borderRadius: round ? width / 2 : radius.tile, backgroundColor: colors.surfaceInset };
  if (uri) return <Image source={{ uri }} style={shape} accessibilityIgnoresInvertColors />;
  return (
    <View style={[shape, styles.blank]}>
      <Text style={[styles.blankLetter, { fontSize: width * 0.3 }]}>{title.trim().charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

export function StatusPill({ badge }: { badge: StatusBadge | null }) {
  return badge ? (
    <Badge tone={badge.tone} glyph={badge.glyph}>
      {badge.label}
    </Badge>
  ) : null;
}

/** Poster with its name and year under it; a glyph in the corner says what the server has. */
export function PosterCard({ item, width, onPress }: { item: SeerrResult; width: number; onPress?: () => void }) {
  const badge = mediaBadge(item.mediaInfo?.status);
  const name = seerrName(item);
  const year = seerrYear(item);
  return (
    <Pressable
      onPress={onPress ?? (() => (item.mediaType === "movie" || item.mediaType === "tv") && openTitle(item.mediaType, item.id))}
      accessibilityRole="button"
      accessibilityLabel={[name, year, badge?.label].filter(Boolean).join(", ")}
      style={({ pressed }) => [{ width, gap: 6 }, pressed && { opacity: 0.7 }]}
    >
      <View>
        <Poster path={item.posterPath} title={name} width={width} />
        {badge ? (
          <View style={[styles.corner, badge.tone === "success" && styles.cornerFull]}>
            <Text style={[styles.cornerGlyph, badge.tone === "success" && { color: colors.urgentInk }]}>{badge.glyph}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 1 }}>
        <Text style={type.rowTitle} numberOfLines={2}>
          {name}
        </Text>
        <Text style={type.rowSubtitle}>{[year, item.mediaType === "tv" ? mt.series : mt.movie].filter(Boolean).join(" · ")}</Text>
      </View>
    </Pressable>
  );
}

/** Small "See all ›" in a section header. */
export function SeeAll({ onPress, label = mt.seeAll }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.seeAll}>
      <Text style={type.link}>{label}</Text>
      <Chevron size={15} color={colors.link} />
    </Pressable>
  );
}

/** A titled row of posters that scrolls sideways, edge to edge. */
export function PosterRail({ title, items, onSeeAll, empty, width = 112 }: { title: string; items: SeerrResult[]; onSeeAll?: () => void; empty?: ReactNode; width?: number }) {
  if (!items.length && !empty) return null;
  return (
    <Card title={title} action={onSeeAll && items.length ? <SeeAll onPress={onSeeAll} /> : undefined}>
      {items.length ? (
        <BleedRow>
          {items.map((item) => (
            <PosterCard key={`${item.mediaType}-${item.id}`} item={item} width={width} />
          ))}
        </BleedRow>
      ) : (
        empty
      )}
    </Card>
  );
}

/** Column width for a poster grid: three across on a phone, more on iPad. */
export function useGridWidth(gap = 12) {
  const { width, height } = useWindowDimensions();
  const room = Math.min(contentWidth(width, height), CONTENT_MAX_WIDTH) - 40;
  const columns = Math.max(3, Math.floor((room + gap) / (130 + gap)));
  return { columns, width: Math.floor((room - gap * (columns - 1)) / columns), gap };
}

export function PosterGrid({ items }: { items: SeerrResult[] }) {
  const { width, gap } = useGridWidth();
  return (
    <View style={[styles.grid, { gap }]}>
      {items.map((item) => (
        <PosterCard key={`${item.mediaType}-${item.id}`} item={item} width={width} />
      ))}
    </View>
  );
}

/** One face in the cast row: photo, name, role. */
export function CastCard({ person }: { person: SeerrCast }) {
  return (
    <Pressable onPress={() => openPerson(person.id)} accessibilityRole="button" accessibilityLabel={[person.name, person.character].filter(Boolean).join(", ")} style={({ pressed }) => [styles.cast, pressed && { opacity: 0.7 }]}>
      <Poster path={person.profilePath} title={person.name} width={72} round />
      <Text style={[type.rowTitle, { fontSize: 12, lineHeight: 16, textAlign: "center" }]} numberOfLines={2}>
        {person.name}
      </Text>
      {person.character ? (
        <Text style={[type.rowSubtitle, { textAlign: "center" }]} numberOfLines={2}>
          {person.character}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** A pill to tap: a genre, a filter. */
export function Chip({ label, onPress, selected }: { label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.7 }]}>
      <Text style={[type.pill, { color: selected ? colors.urgentInk : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** Label then value, one line each, for a title's facts. */
export function FactRows({ rows }: { rows: [string, string][] }) {
  return (
    <View>
      {rows.map(([label, value], index) => (
        <View key={label} style={[styles.fact, index === 0 && { borderTopWidth: 0 }]}>
          <Text style={[type.rowSubtitle, { flex: 1 }]}>{label}</Text>
          <Text style={[type.rowTitle, { flex: 1.6 }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blank: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  blankLetter: { fontFamily: fonts.medium, color: colors.inkFaint },
  corner: { position: "absolute", top: 6, end: 6, minWidth: 22, height: 22, borderRadius: radius.pill, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: colors.shell, borderWidth: 1, borderColor: colors.accent },
  cornerFull: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  cornerGlyph: { fontFamily: fonts.bold, fontSize: 11, color: colors.accent },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cast: { width: 84, alignItems: "center", gap: 4 },
  chip: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  chipSelected: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.hairline }
});
