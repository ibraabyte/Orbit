import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, CheckItem, EmptyState, Icon, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { RequestOptions, useRequestOptions } from "@/components/request-options";
import { CastCard, Chip, FactRows, openCollection, openCredits, openDiscover, Poster, PosterRail, SeeAll, StatusPill } from "@/components/seerr-parts";
import { BleedRow, Button, CONTENT_MAX_WIDTH } from "@/components/screen";
import { colors, fonts, lineHeights, radius, shadow, space, textSize, usePalette } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useSeerr } from "@/hooks/use-seerr";
import { useWatchlist } from "@/hooks/use-watchlist";
import { digits, formatDate, t } from "@/lib/i18n";
import {
  backdropUrl,
  canRequest,
  choiceFrom,
  DEFAULT_CHOICE,
  factLine,
  factRows,
  imdbUrl,
  mediaBadge,
  mt,
  playUrl,
  requestBadge,
  seasonBadge,
  seasonRows,
  seerrName,
  seerrPageUrl,
  streamingIn,
  syncToSeerr,
  topCast,
  trailerUrl,
  type SeerrDetails,
  type SeerrEpisode,
  type SeerrMediaType,
  type RequestChoice,
  type SeerrRatings,
  type SeerrRequest,
  type SeerrResult
} from "@/lib/seerr";
import type { WatchStatus } from "@/lib/types";
import { watchDraftFromSeerr } from "@/lib/watchlist";

type Episodes = SeerrEpisode[] | "loading" | "failed";

// One movie or series, like its page in Seerr: backdrop, poster, facts, request (by season for a series), trailer,
// play, cast, seasons with episodes, and what's like it. Opened from anywhere in Movies & TV.
export default function Title() {
  const params = useLocalSearchParams<{ kind: SeerrMediaType; id: string; edit?: string }>();
  const kind: SeerrMediaType = params.kind === "tv" ? "tv" : "movie";
  const tmdbId = Number(params.id);
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const seerr = useSeerr();
  const client = seerr.client;
  const { sheet } = useOverlays();
  const { userId } = useDashboardData();
  const watchlist = useWatchlist(userId);
  const [item, setItem] = useState<SeerrDetails | null>(null);
  const [ratings, setRatings] = useState<SeerrRatings | null>(null);
  const [recommended, setRecommended] = useState<SeerrResult[]>([]);
  const [similar, setSimilar] = useState<SeerrResult[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [episodes, setEpisodes] = useState<Record<number, Episodes>>({});
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // A movie request being set up (quality picked) before it's sent. A series uses `picking` for the same.
  const [composing, setComposing] = useState(false);
  const [choice, setChoice] = useState<RequestChoice>(DEFAULT_CHOICE);
  // A waiting request being changed (seasons, server, profile, folder, or whose it is) instead of a new one.
  const [editing, setEditing] = useState<SeerrRequest | null>(null);
  const options = useRequestOptions(client, kind, seerr.user);

  const startEdit = (request: SeerrRequest) => {
    setEditing(request);
    setChoice(choiceFrom(request, seerr.user?.id ?? null));
    if (kind === "tv") setPicking(new Set((request.seasons ?? []).map((season) => season.seasonNumber)));
    else setComposing(true);
  };
  const stopEditing = () => {
    setEditing(null);
    setPicking(null);
    setComposing(false);
  };

  // Opened from "Edit request" on the Requests screen: start editing once the title (and its requests) has loaded.
  const editAsked = useRef(false);
  useEffect(() => {
    if (editAsked.current || !params.edit || !item || !seerr.user) return;
    editAsked.current = true;
    const request = item.mediaInfo?.requests?.find((entry) => entry.id === Number(params.edit) && entry.status === 1);
    if (request) startEdit(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when everything it needs is there
  }, [item, seerr.user, params.edit]);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setItem(await client.details(kind, tmdbId));
      setFailed(null);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t.tryAgain);
    }
  }, [client, kind, tmdbId]);

  useEffect(() => {
    void load();
    if (!client) return;
    // Extras: each one can be missing without spoiling the page.
    void client.recommendations(kind, tmdbId).then(setRecommended).catch(() => setRecommended([]));
    void client.similar(kind, tmdbId).then(setSimilar).catch(() => setSimilar([]));
    if (kind === "movie") void client.ratings(tmdbId).then(setRatings).catch(() => setRatings(null));
  }, [load, client, kind, tmdbId]);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPicking(null);
      setComposing(false);
      setEditing(null);
      await load();
    } catch (error) {
      Alert.alert("Seerr", error instanceof Error ? error.message : t.tryAgain);
    } finally {
      setBusy(false);
    }
  };

  const toggleSeason = async (seasonNumber: number) => {
    if (openSeason === seasonNumber) return setOpenSeason(null);
    setOpenSeason(seasonNumber);
    if (!client || Array.isArray(episodes[seasonNumber])) return;
    setEpisodes((before) => ({ ...before, [seasonNumber]: "loading" }));
    try {
      const season = await client.season(tmdbId, seasonNumber);
      setEpisodes((before) => ({ ...before, [seasonNumber]: season.episodes ?? [] }));
    } catch {
      setEpisodes((before) => ({ ...before, [seasonNumber]: "failed" }));
    }
  };

  if (!item) {
    return (
      <View style={[styles.shell, { paddingTop: insets.top + 64, paddingHorizontal: space.xl }]}>
        <EmptyState>{failed ?? (seerr.ready && !seerr.connected ? t.seerrConnect : `${t.loading}…`)}</EmptyState>
      </View>
    );
  }

  const name = seerrName(item);
  const status = item.mediaInfo?.status;
  // Standard and 4K are asked for separately in Seerr, each with its own statuses.
  const openFor = (is4k: boolean) => {
    const rows = kind === "tv" ? seasonRows(item, is4k) : [];
    const free = rows.filter((season) => season.requestable).map((season) => season.seasonNumber);
    return { rows, free, ok: canRequest(item, is4k) && (kind === "movie" || free.length > 0 || !rows.length) };
  };
  const standard = openFor(false);
  const fourK = options.offer4k ? openFor(true) : { rows: [], free: [], ok: false };
  const current = choice.is4k && (picking || composing) ? fourK : standard;
  const seasons = current.rows.length ? current.rows : standard.rows;
  const requestableSeasons = current.free;
  const requestable = standard.ok || fourK.ok;
  const requests = item.mediaInfo?.requests ?? [];
  const waiting = requests.filter((request) => request.status === 1);
  const mine = waiting.find((request) => seerr.user && request.requestedBy?.id === seerr.user.id);
  const backdrop = backdropUrl(item.backdropPath, 1280);
  const trailer = trailerUrl(item.relatedVideos);
  const play = playUrl(item.mediaInfo);
  const page = seerrPageUrl(seerr.serverUrl, kind, tmdbId);
  const imdb = imdbUrl(item);
  const cast = topCast(item);
  const facts = factRows(item, (day) => formatDate(day, { day: "numeric", month: "short", year: "numeric" }));
  const onList = watchlist.items.find((row) => row.tmdb_id === tmdbId && row.media_type === kind);
  const listChoices: [WatchStatus, string][] = [["want", t.wantToWatch], ["watching", t.watching], ["done", t.watched]];
  // Seerr's watchlist follows Orbit's: want and watching are on it, done is off it.
  const setListStatus = (next: WatchStatus) =>
    act(async () => {
      await (onList ? watchlist.update(onList.id, { status: next }) : watchlist.save(watchDraftFromSeerr(item, next)!));
      if (client) await syncToSeerr(client, kind, tmdbId, name, next);
    });

  // Sent with the picked quality; without options it's one tap, like before.
  const send = (seasonList: number[] | "all") =>
    act(() => (editing ? client!.editRequest(editing.id, kind, tmdbId, seasonList, { ...choice, userId: choice.userId ?? seerr.user?.id ?? null }, options.advanced) : client!.request(kind, tmdbId, seasonList, choice, options.advanced)));
  // While editing, the request's own seasons can be picked too (Seerr counts them as taken).
  const editingSeasons = new Set((editing?.seasons ?? []).map((season) => season.seasonNumber));
  const pickable = (season: { seasonNumber: number; requestable: boolean }) => season.requestable || editingSeasons.has(season.seasonNumber);
  const startRequest = () => {
    const first: RequestChoice = { ...DEFAULT_CHOICE, is4k: !standard.ok && fourK.ok };
    setChoice(first);
    const from = first.is4k ? fourK : standard;
    if (kind === "movie" || !from.rows.length) {
      if (!options.hasOptions) return void act(() => client!.request(kind, tmdbId, "all", first, false));
      return setComposing(true);
    }
    setPicking(new Set(from.free));
  };
  const changeChoice = (next: RequestChoice) => {
    // Switching between standard and 4K changes which seasons are still free to ask for.
    if (picking && next.is4k !== choice.is4k) setPicking(new Set((next.is4k ? fourK : standard).free));
    setChoice(next);
  };
  // An edit keeps its quality (Seerr doesn't change it), so only that one is offered.
  const optionsPanel = options.hasOptions ? <RequestOptions options={options} choice={choice} onChange={changeChoice} allowStandard={editing ? !editing.is4k : standard.ok} allow4k={editing ? Boolean(editing.is4k) : fourK.ok} /> : null;
  const flipPick = (seasonNumber: number) =>
    setPicking((before) => {
      const next = new Set(before);
      if (next.has(seasonNumber)) next.delete(seasonNumber);
      else next.add(seasonNumber);
      return next;
    });

  const streaming = streamingIn(item);
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  const links = [
    trailer ? { label: `▶ ${mt.trailer}`, url: trailer } : null,
    page ? { label: `${mt.openInSeerr} ↗`, url: page } : null,
    imdb ? { label: `${mt.imdb} ↗`, url: imdb } : null
  ].filter(Boolean) as { label: string; url: string }[];

  const requestRow = (request: SeerrRequest) => (
    <ListRow
      key={request.id}
      title={request.requestedBy?.displayName ?? mt.requestedBy}
      badges={<StatusPill badge={requestBadge(request.status)} />}
      subtitle={[request.seasons?.length ? mt.seasonsAsked(request.seasons.map((season) => season.seasonNumber).join(mt.sep)) : null, formatDate(request.createdAt)].filter(Boolean).join(" · ")}
      trailing={
        <View style={{ gap: space.sm }}>
          <RowButton icon="check" label={mt.approve} disabled={busy} onPress={() => act(() => client!.approve(request.id))} />
          <RowButton outline label={mt.decline} disabled={busy} onPress={() => act(() => client!.decline(request.id))} />
          <RowButton outline label={mt.editRequest} disabled={busy || Boolean(editing)} onPress={() => startEdit(request)} />
        </View>
      }
    />
  );

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
        <View style={styles.backdrop}>
          {backdrop ? <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
          {/* The picture fades into the ground, so the poster and name sit on it. A gradient needs a plain colour, so it follows the setting by re-rendering. */}
          <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(180deg, transparent 0%, transparent 35%, ${palette.shell} 100%)` }]} />
        </View>
        <View style={styles.content}>
          <View style={styles.head}>
            <View style={styles.posterShadow}>
              <Poster path={item.posterPath} title={name} width={116} />
            </View>
            <View style={{ flex: 1, gap: space.sm, justifyContent: "flex-end" }}>
              <Text style={styles.name} accessibilityRole="header">
                {name}
              </Text>
              <Text style={type.rowSubtitle}>{factLine(item).join(" · ")}</Text>
              <View style={styles.badges}>
                <StatusPill badge={mediaBadge(status)} />
                {mine ? <StatusPill badge={requestBadge(1)} /> : null}
              </View>
            </View>
          </View>

          {item.tagline ? <Text style={styles.tagline}>{item.tagline}</Text> : null}

          <View style={{ gap: space.sm }}>
            {play ? <Button variant="primary" title={`▶ ${mt.play}`} onPress={() => void Linking.openURL(play).catch(() => open(play))} /> : null}
            {requestable && !picking && !composing ? <Button variant={play ? "outline" : "primary"} disabled={busy || !client} title={!standard.ok ? mt.request4k : kind === "tv" && status === 4 ? mt.requestMore : kind === "tv" && seasons.length ? mt.requestSeasons : mt.request} onPress={startRequest} /> : null}
            {mine && !editing ? <Button variant="outline" disabled={busy} title={mt.editRequest} onPress={() => startEdit(mine)} /> : null}
            {mine ? <Button variant="outline" disabled={busy} title={mt.cancelRequest} onPress={() => sheet({ title: mt.cancelRequestTitle, detail: name, options: [{ label: mt.cancelRequest, destructive: true, run: () => void act(() => client!.cancel(mine.id)) }] })} /> : null}
          </View>

          {links.length ? (
            <View style={styles.links}>
              {links.map((link) => (
                <RowButton key={link.label} outline label={link.label} onPress={() => open(link.url)} />
              ))}
            </View>
          ) : null}

          {composing ? (
            <Card title={mt.requestOptions}>
              {optionsPanel}
              <View style={{ gap: space.sm, paddingTop: space.xs }}>
                <Button variant="primary" disabled={busy} title={editing ? mt.saveRequest : choice.is4k ? mt.request4k : mt.request} onPress={() => send("all")} />
                <Button variant="outline" title={t.cancel} onPress={stopEditing} />
              </View>
            </Card>
          ) : null}

          {seerr.isAdmin && waiting.length ? <Card title={mt.awaiting}>{waiting.map(requestRow)}</Card> : null}

          {kind === "tv" && seasons.length ? (
            <Card title={mt.seasonsTitle}>
              {picking ? <Text style={type.rowSubtitle}>{mt.pickSeasons}</Text> : null}
              {seasons.map((season) => {
                const shown = openSeason === season.seasonNumber;
                const list = episodes[season.seasonNumber];
                const badge = seasonBadge(season);
                return (
                  <View key={season.seasonNumber}>
                    <ListRow
                      leading={
                        picking && pickable(season) ? (
                          <CheckItem checked={picking.has(season.seasonNumber)} onPress={() => flipPick(season.seasonNumber)} label={season.name ?? `${mt.season} ${season.seasonNumber}`} />
                        ) : (
                          <Poster path={season.posterPath} title={String(season.seasonNumber)} width={36} />
                        )
                      }
                      title={season.name ?? `${mt.season} ${season.seasonNumber}`}
                      badges={badge ? <StatusPill badge={badge} /> : undefined}
                      subtitle={[season.episodeCount ? mt.episodes(season.episodeCount) : null, season.airDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                      onPress={() => (picking && pickable(season) ? flipPick(season.seasonNumber) : void toggleSeason(season.seasonNumber))}
                      trailing={picking ? undefined : <Icon name={shown ? "chevron-up" : "chevron-down"} size={16} color={colors.inkFaint} />}
                    />
                    {shown && !picking ? (
                      <View style={styles.episodes}>
                        {list === "loading" || list === undefined ? <Text style={type.rowSubtitle}>{`${t.loading}…`}</Text> : null}
                        {list === "failed" ? <Text style={type.rowSubtitle}>{t.tryAgain}</Text> : null}
                        {Array.isArray(list) && !list.length ? <Text style={type.rowSubtitle}>{mt.noEpisodes}</Text> : null}
                        {Array.isArray(list)
                          ? list.map((episode) => (
                              <View key={episode.id} style={styles.episode}>
                                <Text style={type.rowTitle}>
                                  <Text style={styles.episodeNumber}>{`E${episode.episodeNumber}  `}</Text>
                                  {episode.name}
                                </Text>
                                {episode.airDate ? <Text style={type.rowSubtitle}>{formatDate(episode.airDate, { day: "numeric", month: "short", year: "numeric" })}</Text> : null}
                                {episode.overview ? (
                                  <Text style={type.rowSubtitle} numberOfLines={3}>
                                    {episode.overview}
                                  </Text>
                                ) : null}
                              </View>
                            ))
                          : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {picking && optionsPanel ? <View style={styles.pickOptions}>{optionsPanel}</View> : null}
              {picking ? (
                <View style={{ gap: space.sm, paddingTop: space.sm }}>
                  <Button variant="primary" disabled={busy || picking.size === 0} title={editing ? mt.saveRequest : `${picking.size === requestableSeasons.length && picking.size > 1 ? `${mt.request} · ${mt.requestAll}` : mt.requestPicked(picking.size)}${choice.is4k ? ` · ${mt.fourK}` : ""}`} onPress={() => send([...picking].sort((a, b) => a - b))} />
                  <Button variant="outline" title={t.cancel} onPress={stopEditing} />
                </View>
              ) : null}
            </Card>
          ) : null}

          {item.overview ? (
            <Card title={mt.overview}>
              <Text style={type.body}>{item.overview}</Text>
            </Card>
          ) : null}

          {item.voteAverage || ratings?.criticsScore || ratings?.audienceScore ? (
            <Card title={mt.ratings}>
              <View style={styles.ratings}>
                {item.voteAverage ? <Rating label={mt.tmdb} value={`★ ${digits(item.voteAverage.toFixed(1))}`} detail={item.voteCount ? mt.votes(item.voteCount) : undefined} /> : null}
                {ratings?.criticsScore ? <Rating label={mt.critics} value={`${ratings.criticsScore}%`} detail={ratings.criticsRating} /> : null}
                {ratings?.audienceScore ? <Rating label={mt.audience} value={`${ratings.audienceScore}%`} detail={ratings.audienceRating} /> : null}
              </View>
            </Card>
          ) : null}

          {streaming.providers.length ? (
            <Card title={mt.streamingOn}>
              <BleedRow>
                {streaming.providers.map((provider) => (
                  <Chip key={provider.id} label={provider.name} onPress={() => (streaming.link ? open(streaming.link) : undefined)} />
                ))}
              </BleedRow>
            </Card>
          ) : null}

          {item.genres?.length ? (
            <BleedRow>
              {item.genres.map((genre) => (
                <Chip key={genre.id} label={genre.name} onPress={() => openDiscover({ row: "genre", kind, genreId: genre.id }, genre.name)} />
              ))}
            </BleedRow>
          ) : null}

          {facts.length ? (
            <Card title={mt.details}>
              <FactRows rows={facts} />
            </Card>
          ) : null}

          {item.keywords?.length ? (
            <Card title={mt.keywords}>
              <BleedRow>
                {item.keywords.map((keyword) => (
                  <Chip key={keyword.id} label={keyword.name} onPress={() => openDiscover({ row: "filtered", kind, filters: { keywords: String(keyword.id) } }, keyword.name)} />
                ))}
              </BleedRow>
            </Card>
          ) : null}

          {item.collection ? (
            <Card title={mt.collection}>
              <ListRow leading={<Poster path={item.collection.posterPath} title={item.collection.name} width={36} />} title={item.collection.name} onPress={() => openCollection(item.collection!.id)} />
            </Card>
          ) : null}

          {cast.length ? (
            <Card title={mt.cast} action={<SeeAll onPress={() => openCredits(kind, tmdbId)} />}>
              <BleedRow>
                {cast.map((person) => (
                  <CastCard key={person.id} person={person} />
                ))}
              </BleedRow>
            </Card>
          ) : null}

          {watchlist.available ? (
            <Card title={mt.watchList}>
              <View style={styles.links}>
                {listChoices.map(([value, label]) => (
                  <Chip key={value} label={label} selected={onList?.status === value} onPress={() => void setListStatus(value)} />
                ))}
                {onList ? <RowButton outline label={t.remove} onPress={() => act(async () => (await watchlist.remove(onList.id), client ? await syncToSeerr(client, kind, tmdbId, name, null) : undefined))} /> : null}
              </View>
            </Card>
          ) : null}

          {seerr.isAdmin ? <Manage seerr={seerr} kind={kind} item={item} act={act} open={open} busy={busy} /> : null}

          <PosterRail title={mt.recommended} items={recommended} />
          <PosterRail title={mt.similar} items={similar} />
        </View>
      </ScrollView>
    </View>
  );
}

function Rating({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View style={styles.rating}>
      <Text style={type.tileLabel}>{label}</Text>
      <Text style={styles.ratingValue}>{value}</Text>
      {detail ? <Text style={type.rowSubtitle}>{detail}</Text> : null}
    </View>
  );
}

// How far the poster and name rise over the bottom of the backdrop picture.
const POSTER_OVERLAP = 120;

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.shell },
  backdrop: { height: 260, backgroundColor: colors.surface },
  content: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", paddingHorizontal: space.xl, gap: space.lg, marginTop: -POSTER_OVERLAP },
  head: { flexDirection: "row", gap: space.lg, alignItems: "flex-end" },
  posterShadow: { boxShadow: shadow.poster },
  name: { fontFamily: fonts.medium, fontSize: textSize.title2, lineHeight: lineHeights.title2, letterSpacing: -0.4, color: colors.onShell },
  tagline: { fontFamily: fonts.regular, fontStyle: "italic", fontSize: textSize.footnote, lineHeight: lineHeights.footnote, color: colors.inkMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  links: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pickOptions: { paddingTop: space.md, marginTop: space.xs, borderTopWidth: 1, borderTopColor: colors.hairline },
  episodes: { paddingStart: space.huge, paddingBottom: space.sm, gap: space.md },
  episode: { gap: space.xs },
  episodeNumber: { fontFamily: fonts.medium, color: colors.link },
  ratings: { flexDirection: "row", gap: space.md },
  rating: { flex: 1, gap: space.xs, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.tile, padding: space.md, alignItems: "flex-start" },
  ratingValue: { fontFamily: fonts.medium, fontSize: textSize.title3, color: colors.ink },
});

// Seerr's "Manage" panel, for people who manage requests: open it in Radarr/Sonarr, mark it available, clear what
// Seerr knows, remove it from the server, and the blocklist. The ones that delete things ask first.
function Manage({ seerr, kind, item, act, open, busy }: { seerr: ReturnType<typeof useSeerr>; kind: SeerrMediaType; item: SeerrDetails; act: (work: () => Promise<unknown>) => Promise<void>; open: (url: string) => void; busy: boolean }) {
  const client = seerr.client;
  const { sheet } = useOverlays();
  if (!client) return null;
  const mediaId = item.mediaInfo?.id;
  const status = item.mediaInfo?.status;
  const name = seerrName(item);
  const confirm = (title: string, detail: string, run: () => Promise<unknown>) => sheet({ title, detail: `${name}\n${detail}`, options: [{ label: title, destructive: true, run: () => void act(run) }] });
  const seasons = kind === "tv" ? (item.seasons ?? []).map((season) => season.seasonNumber).filter((number) => number !== 0) : undefined;
  return (
    <Card title={mt.manage} style={{ gap: space.md }}>
      <Text style={type.rowSubtitle}>{mt.manageHint}</Text>
      <View style={styles.links}>
        {item.mediaInfo?.serviceUrl ? <RowButton outline label={`${mt.openInService(kind)} ↗`} onPress={() => open(item.mediaInfo!.serviceUrl!)} /> : null}
        {mediaId && status !== 5 && status !== 6 ? <RowButton outline label={mt.markAvailable} disabled={busy} onPress={() => void act(() => client.markAvailable(mediaId, seasons))} /> : null}
        {status === 6 ? (
          <RowButton outline label={mt.removeBlocklist} disabled={busy} onPress={() => void act(() => client.unblocklist(kind, item.id))} />
        ) : seerr.user ? (
          <RowButton outline label={mt.addBlocklist} disabled={busy} onPress={() => confirm(mt.addBlocklist, mt.addBlocklistDetail, () => client.blocklist(kind, item.id, name, seerr.user!.id))} />
        ) : null}
        {mediaId ? <RowButton outline label={mt.clearData} disabled={busy} onPress={() => confirm(mt.clearData, mt.clearDataDetail, () => client.clearData(mediaId))} /> : null}
        {mediaId && (status === 3 || status === 4 || status === 5) ? <RowButton outline label={mt.removeFiles(kind)} disabled={busy} onPress={() => confirm(mt.removeFiles(kind), mt.removeFilesDetail, () => client.removeFiles(mediaId))} /> : null}
      </View>
    </Card>
  );
}
