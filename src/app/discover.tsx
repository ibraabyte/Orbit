import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/drift";
import { PosterGrid } from "@/components/seerr-parts";
import { Button, Screen } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { t } from "@/lib/i18n";
import { DISCOVER_ROWS, mt, type DiscoverList, type DiscoverRow, type SeerrMediaType, type SeerrResult } from "@/lib/seerr";

// "See all" for one Discover row or one genre: a poster grid that loads page after page.
function listFrom(params: { row?: string; kind?: string; genre?: string }): DiscoverList | null {
  if (params.row === "genre" && (params.kind === "movie" || params.kind === "tv") && Number(params.genre)) return { row: "genre", kind: params.kind as SeerrMediaType, genreId: Number(params.genre) };
  return DISCOVER_ROWS.includes(params.row as DiscoverRow) ? { row: params.row as DiscoverRow } : null;
}

export default function Discover() {
  const params = useLocalSearchParams<{ row?: string; kind?: string; genre?: string; name?: string }>();
  const list = listFrom(params);
  const seerr = useSeerr();
  const [items, setItems] = useState<SeerrResult[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
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

  const kind = list?.row === "genre" ? (list.kind === "tv" ? mt.series : mt.movie) : null;
  const title = list?.row === "genre" ? [params.name || mt.rows.genre, kind].join(" · ") : list ? mt.rows[list.row] : t.movies;

  return (
    <Screen title={title} refreshing={loading && page <= 1} onRefresh={() => load(1)}>
      {failed ? <EmptyState>{failed}</EmptyState> : null}
      {items.length ? <PosterGrid items={items} /> : <EmptyState>{loading || !seerr.ready ? `${t.loading}…` : mt.nothingFound}</EmptyState>}
      {page > 0 && page < pages ? <Button variant="outline" title={loading ? `${t.loading}…` : mt.loadMore} disabled={loading} onPress={() => load(page + 1)} /> : null}
    </Screen>
  );
}
