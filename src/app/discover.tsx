import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Card, EmptyState, type } from "@/components/drift";
import { Chip, PosterGrid } from "@/components/seerr-parts";
import { BleedRow, Button, Screen } from "@/components/screen";
import { space } from "@/components/theme";
import { useSeerr } from "@/hooks/use-seerr";
import { digits, t } from "@/lib/i18n";
import { filterBase, languageName, listTitle, mt, parseList, WATCH_REGION, withFilters, type DiscoverFilters, type SeerrMediaType, type SeerrProvider, type SeerrResult } from "@/lib/seerr";

type Option = { label: string; on: boolean; pick: () => void };

const DECADES = [2020, 2010, 2000, 1990, 1980];
const RATINGS = [6, 7, 8];
const LANGUAGES = ["ar", "en", "ko", "ja", "hi", "tr", "es", "fr"];

function sorts(kind: SeerrMediaType) {
  return [
    { key: "popular", value: "popularity.desc" },
    { key: "newest", value: kind === "tv" ? "first_air_date.desc" : "primary_release_date.desc" },
    { key: "rating", value: "vote_average.desc" },
    { key: "title", value: kind === "tv" ? "original_name.asc" : "original_title.asc" }
  ] as const;
}

const RUNTIMES = { short: { withRuntimeLte: "90" }, medium: { withRuntimeGte: "90", withRuntimeLte: "150" }, long: { withRuntimeGte: "150" } } as const;

// A comma or bar separated list with one id switched on or off.
function flip(list: string | undefined, id: string, separator: string) {
  const ids = (list ?? "").split(separator).filter(Boolean);
  const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  return next.length ? next.join(separator) : undefined;
}

function FilterRow({ title, options }: { title: string; options: Option[] }) {
  if (!options.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.rowSubtitle}>{title}</Text>
      <BleedRow>
        {options.map((option) => (
          <Chip key={option.label} label={option.label} selected={option.on} onPress={option.pick} />
        ))}
      </BleedRow>
    </View>
  );
}

// Seerr's filter panel for movies and series: sort, genres, years, rating, length, original language, streaming.
function Filters({ kind, filters, set }: { kind: SeerrMediaType; filters: DiscoverFilters; set: (change: DiscoverFilters) => void }) {
  const seerr = useSeerr();
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [providers, setProviders] = useState<SeerrProvider[]>([]);
  useEffect(() => {
    if (!seerr.client) return;
    void seerr.client.genres(kind).then(setGenres, () => undefined);
    void seerr.client.providers(kind).then((list) => setProviders(list.slice(0, 20)), () => undefined);
  }, [seerr.client, kind]);

  const runtime = (Object.keys(RUNTIMES) as (keyof typeof RUNTIMES)[]).find((key) => {
    const wanted = RUNTIMES[key] as DiscoverFilters;
    return filters.withRuntimeGte === wanted.withRuntimeGte && filters.withRuntimeLte === wanted.withRuntimeLte;
  });
  return (
    <>
      <FilterRow
        title={mt.filter.sort}
        // Sorting by rating alone puts titles with a handful of votes first; Seerr's own page has the same problem.
        // ponytail: a fixed floor of 100 votes, make it a filter if it ever hides something wanted.
        options={sorts(kind).map((sort) => ({ label: mt.filter.sorts[sort.key], on: (filters.sortBy ?? "popularity.desc") === sort.value, pick: () => set({ sortBy: sort.value, voteCountGte: sort.key === "rating" ? "100" : undefined }) }))}
      />
      <FilterRow title={mt.filter.genres} options={genres.map((genre) => ({ label: genre.name, on: (filters.genre ?? "").split(",").includes(String(genre.id)), pick: () => set({ genre: flip(filters.genre, String(genre.id), ",") }) }))} />
      <FilterRow
        title={mt.filter.years}
        options={DECADES.map((decade) => ({
          label: digits(`${decade}–${decade + 9}`),
          on: filters.from === `${decade}-01-01`,
          pick: () => set(filters.from === `${decade}-01-01` ? { from: undefined, to: undefined } : { from: `${decade}-01-01`, to: `${decade + 9}-12-31` })
        }))}
      />
      <FilterRow title={mt.filter.rating} options={RATINGS.map((rating) => ({ label: digits(`${rating}+ ★`), on: filters.voteAverageGte === String(rating), pick: () => set({ voteAverageGte: filters.voteAverageGte === String(rating) ? undefined : String(rating) }) }))} />
      <FilterRow
        title={mt.filter.runtime}
        options={(Object.keys(RUNTIMES) as (keyof typeof RUNTIMES)[]).map((key) => ({
          label: digits(mt.filter.runtimes[key]),
          on: runtime === key,
          pick: () => set(runtime === key ? { withRuntimeGte: undefined, withRuntimeLte: undefined } : { withRuntimeGte: undefined, withRuntimeLte: undefined, ...RUNTIMES[key] })
        }))}
      />
      <FilterRow title={mt.filter.language} options={LANGUAGES.map((code) => ({ label: languageName(code) ?? code, on: filters.language === code, pick: () => set({ language: filters.language === code ? undefined : code }) }))} />
      <FilterRow
        title={mt.filter.streaming}
        options={providers.map((provider) => ({
          label: provider.name,
          on: (filters.watchProviders ?? "").split("|").includes(String(provider.id)),
          pick: () => {
            const watchProviders = flip(filters.watchProviders, String(provider.id), "|");
            set({ watchProviders, watchRegion: watchProviders ? WATCH_REGION : undefined });
          }
        }))}
      />
    </>
  );
}

// "See all" for one rail, genre, studio or network: a poster grid that loads page after page. Movie and series lists
// take filters and a sort, like Seerr's own.
export default function Discover() {
  const params = useLocalSearchParams<{ list?: string; name?: string }>();
  const base = parseList(params.list);
  const seerr = useSeerr();
  const [choices, setChoices] = useState<DiscoverFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<SeerrResult[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const list = base ? withFilters(base, choices) : null;
  const filterable = base ? filterBase(base) : null;
  const key = JSON.stringify(list);

  const load = useCallback(
    async (next: number) => {
      if (!seerr.client || !list) return;
      setLoading(true);
      try {
        const body = await seerr.client.discover(list, next);
        setItems((before) => (next === 1 ? body.results : [...before, ...body.results.filter((item) => !before.some((old) => old.id === item.id && old.mediaType === item.mediaType))]));
        setPage(body.page);
        setPages(body.totalPages);
        setFailed(null);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : t.tryAgain);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for the list
    [seerr.client, key]
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const picked = Object.keys(choices).length > 0;
  const set = (change: DiscoverFilters) => setChoices((before) => ({ ...before, ...change }));

  return (
    <Screen title={base ? listTitle(base, params.name) : t.movies} refreshing={loading && page <= 1} onRefresh={() => load(1)}>
      {filterable ? (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button variant="outline" title={showFilters ? mt.filter.hide : mt.filter.show} onPress={() => setShowFilters(!showFilters)} />
          {picked ? <Button variant="outline" title={mt.filter.clear} onPress={() => setChoices({})} /> : null}
        </View>
      ) : null}
      {filterable && showFilters ? (
        <Card style={{ gap: space.md, paddingVertical: space.lg }}>
          <Filters kind={filterable.kind} filters={{ ...filterable.filters, ...choices }} set={set} />
        </Card>
      ) : null}
      {failed ? <EmptyState>{failed}</EmptyState> : null}
      {items.length ? <PosterGrid items={items} /> : <EmptyState>{loading || !seerr.ready ? `${t.loading}…` : mt.nothingFound}</EmptyState>}
      {page > 0 && page < pages ? <Button variant="outline" title={loading ? `${t.loading}…` : mt.loadMore} disabled={loading} onPress={() => load(page + 1)} /> : null}
    </Screen>
  );
}
