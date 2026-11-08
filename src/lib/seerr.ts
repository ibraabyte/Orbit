import type { ApiClient } from "@/lib/api";
import { digits, isArabic } from "@/lib/i18n";

// Seerr (Overseerr / Jellyseerr) API client and the pieces the Movies & TV screens build on. Same /api/v1 for all.
// The server URL and API key are entered in the app once and kept, encrypted, on Orbit's server for this account.

// What older versions of the app kept in the phone's secure store; moved to the server on first open.
export type SeerrConfig = { url: string; apiKey: string };
export type SeerrMediaType = "movie" | "tv";

// mediaInfo.status: what the server has. 6 is "blocklisted" (Jellyseerr) or "deleted" (newer Overseerr).
export type MediaStatus = 1 | 2 | 3 | 4 | 5 | 6 | 7;
// request.status: what happened to the ask. 4 failed, 5 completed (Jellyseerr).
export type RequestStatus = 1 | 2 | 3 | 4 | 5;

export const MEDIA_STATUS = { 1: "Unknown", 2: "Pending", 3: "Processing", 4: "Partly available", 5: "Available" } as const;
export const REQUEST_STATUS = { 1: "Waiting for approval", 2: "Approved", 3: "Declined" } as const;

export type SeerrResult = {
  id: number;
  mediaType: SeerrMediaType | "person";
  title?: string;
  name?: string;
  releaseDate?: string;
  firstAirDate?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  profilePath?: string | null; // people in search
  overview?: string;
  voteAverage?: number;
  mediaInfo?: SeerrMediaInfo;
};

export type SeerrMediaInfo = {
  id?: number;
  tmdbId?: number;
  status: MediaStatus;
  // The same for the 4K copy, when Seerr has a 4K Radarr/Sonarr.
  status4k?: MediaStatus;
  seasons?: { seasonNumber: number; status: MediaStatus; status4k?: MediaStatus }[];
  requests?: SeerrRequest[];
  // Where to play it: Jellyfin/Emby (Jellyseerr) or Plex (Overseerr).
  mediaUrl?: string | null;
  plexUrl?: string | null;
  iOSPlexUrl?: string | null;
};

export type SeerrCast = { id: number; name: string; character?: string; profilePath?: string | null; order?: number };
export type SeerrCrew = { id: number; name: string; job?: string; department?: string; profilePath?: string | null };
export type SeerrVideo = { key?: string; name?: string; site?: string; type?: string; url?: string };

export type SeerrSeason = { id?: number; seasonNumber: number; name?: string; episodeCount?: number; airDate?: string | null; overview?: string; posterPath?: string | null };
export type SeerrEpisode = { id: number; episodeNumber: number; seasonNumber: number; name?: string; airDate?: string | null; overview?: string; stillPath?: string | null; voteAverage?: number };

// What GET movie/:id and tv/:id add on top of a search result.
export type SeerrDetails = SeerrResult & {
  tagline?: string;
  status?: string; // "Released", "Returning Series", "Ended"...
  originalLanguage?: string;
  originalTitle?: string;
  originalName?: string;
  runtime?: number;
  episodeRunTime?: number[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  voteCount?: number;
  budget?: number;
  revenue?: number;
  lastAirDate?: string;
  nextEpisodeToAir?: { airDate?: string; episodeNumber?: number; seasonNumber?: number; name?: string } | null;
  genres?: { id: number; name: string }[];
  networks?: { id: number; name: string }[];
  productionCompanies?: { id: number; name: string }[];
  createdBy?: { id: number; name: string }[];
  seasons?: SeerrSeason[];
  credits?: { cast?: SeerrCast[]; crew?: SeerrCrew[] };
  relatedVideos?: SeerrVideo[];
  externalIds?: { imdbId?: string | null };
  imdbId?: string | null;
};

export type SeerrRatings = { criticsScore?: number; criticsRating?: string; audienceScore?: number; audienceRating?: string; url?: string };

export type SeerrPerson = {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  placeOfBirth?: string | null;
  knownForDepartment?: string;
  profilePath?: string | null;
};

export type SeerrCredit = SeerrResult & { character?: string; job?: string; popularity?: number };

export type SeerrRequest = {
  id: number;
  status: RequestStatus;
  createdAt: string;
  updatedAt?: string;
  type: SeerrMediaType;
  is4k?: boolean;
  media: { tmdbId: number; status: MediaStatus; mediaType: SeerrMediaType };
  seasons?: { seasonNumber: number; status?: RequestStatus }[];
  requestedBy?: { id?: number; displayName?: string };
  modifiedBy?: { id?: number; displayName?: string } | null;
};

export type SeerrPage<T> = { page: number; totalPages: number; totalResults?: number; results: T[] };
export type SeerrRequestPage = { pageInfo: { pages: number; page: number; results: number; pageSize?: number }; results: SeerrRequest[] };
export type SeerrCounts = { total?: number; movie?: number; tv?: number; pending: number; approved?: number; declined?: number; processing?: number; available?: number };
export type SeerrQuotaPart = { days?: number; limit?: number; used?: number; remaining?: number; restricted?: boolean };
export type SeerrQuota = { movie?: SeerrQuotaPart; tv?: SeerrQuotaPart };

export type SeerrUser = { id: number; displayName?: string; permissions: number };

// Seerr's permission bits.
const ADMIN = 2;
const MANAGE_REQUESTS = 16;
const REQUEST_4K = 1024;
const REQUEST_4K_MOVIE = 2048;
const REQUEST_4K_TV = 4096;
const REQUEST_ADVANCED = 8192;

// A Radarr (movies) or Sonarr (series) server set up in Seerr, and one server's quality profiles and folders.
// Seerr sends these without the servers' own addresses or keys.
export type SeerrService = { id: number; name: string; is4k: boolean; isDefault: boolean; activeProfileId?: number; activeDirectory?: string };
export type SeerrServiceDetails = { server: SeerrService; profiles: { id: number; name: string }[]; rootFolders: { id: number; path: string; freeSpace?: number }[] };

// What the person picked before sending a request. null = let Seerr use the server's default.
export type RequestChoice = { is4k: boolean; serverId: number | null; profileId: number | null; rootFolder: string | null };
export const DEFAULT_CHOICE: RequestChoice = { is4k: false, serverId: null, profileId: null, rootFolder: null };

export const REQUEST_FILTERS = ["all", "pending", "processing", "available", "failed"] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];

// The rows on the Movies & TV screen, each with a "see all" list.
export const DISCOVER_ROWS = ["trending", "movies", "tv", "upcomingMovies", "upcomingTv"] as const;
export type DiscoverRow = (typeof DISCOVER_ROWS)[number];
export type DiscoverList = { row: DiscoverRow } | { row: "genre"; kind: SeerrMediaType; genreId: number };

export function normalizeSeerrUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function canManageRequests(user: Pick<SeerrUser, "permissions">) {
  return (user.permissions & (ADMIN | MANAGE_REQUESTS)) !== 0;
}

// Same rule as Seerr's own request window: quality profile, server and folder are for admins, request managers, and
// people given "Advanced requests". Everyone else gets the server's default (Seerr would ignore the rest anyway).
export function canRequestAdvanced(user: Pick<SeerrUser, "permissions"> | null) {
  return user ? (user.permissions & (ADMIN | MANAGE_REQUESTS | REQUEST_ADVANCED)) !== 0 : false;
}

export function canRequest4k(user: Pick<SeerrUser, "permissions"> | null, kind: SeerrMediaType) {
  return user ? (user.permissions & (ADMIN | REQUEST_4K | (kind === "tv" ? REQUEST_4K_TV : REQUEST_4K_MOVIE))) !== 0 : false;
}

// The servers for standard or 4K requests, Seerr's default one first.
export function servicesFor(services: SeerrService[], is4k: boolean) {
  return services.filter((service) => Boolean(service.is4k) === is4k).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// The server a request goes to: the one picked if it fits, else Seerr's default for that kind.
export function chosenService(services: SeerrService[], choice: Pick<RequestChoice, "is4k" | "serverId">) {
  const list = servicesFor(services, choice.is4k);
  return list.find((service) => service.id === choice.serverId) ?? list[0] ?? null;
}

// The body of POST /request. Only what was picked is sent, so Seerr fills in its own defaults for the rest
// (and its anime profile for anime series).
export function requestBody(kind: SeerrMediaType, tmdbId: number, seasons: number[] | "all", choice: RequestChoice = DEFAULT_CHOICE, advanced = false) {
  const body: Record<string, unknown> = { mediaType: kind, mediaId: tmdbId };
  if (kind === "tv") body.seasons = seasons;
  if (choice.is4k) body.is4k = true;
  if (advanced && (choice.serverId !== null || choice.profileId !== null || choice.rootFolder !== null)) {
    if (choice.serverId !== null) body.serverId = choice.serverId;
    if (choice.profileId !== null) body.profileId = choice.profileId;
    if (choice.rootFolder !== null) body.rootFolder = choice.rootFolder;
  }
  return body;
}

export function seerrName(item: Pick<SeerrResult, "title" | "name">) {
  return item.title ?? item.name ?? mt.untitled;
}

export function seerrYear(item: Pick<SeerrResult, "releaseDate" | "firstAirDate">) {
  return (item.releaseDate ?? item.firstAirDate ?? "").slice(0, 4);
}

export function seerrTitle(item: Pick<SeerrResult, "title" | "name" | "releaseDate" | "firstAirDate">) {
  const year = seerrYear(item);
  return `${seerrName(item)}${year ? ` (${year})` : ""}`;
}

// TMDB image sizes Seerr uses: posters w185-w500, backdrops w780/w1280, faces w185.
export function posterUrl(posterPath: string | null | undefined, width: 185 | 342 | 500 = 342) {
  return posterPath ? `https://image.tmdb.org/t/p/w${width}${posterPath}` : null;
}

export function backdropUrl(backdropPath: string | null | undefined, width: 780 | 1280 = 780) {
  return backdropPath ? `https://image.tmdb.org/t/p/w${width}${backdropPath}` : null;
}

export function isMedia(item: Pick<SeerrResult, "mediaType">): item is SeerrResult & { mediaType: SeerrMediaType } {
  return item.mediaType === "movie" || item.mediaType === "tv";
}

// One title can appear twice in a page (Seerr pages overlap); keep the first.
export function uniqueResults<T extends Pick<SeerrResult, "id" | "mediaType">>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// What the server has, as a short badge. Null when there's nothing to say (not requested yet).
export type StatusBadge = { label: string; glyph: string; tone: "success" | "accent" | "neutral" | "urgent" };

export function mediaBadge(status: MediaStatus | undefined): StatusBadge | null {
  if (status === 5) return { label: mt.status.available, glyph: "✓", tone: "success" };
  if (status === 4) return { label: mt.status.partial, glyph: "◐", tone: "accent" };
  if (status === 3) return { label: mt.status.processing, glyph: "↓", tone: "accent" };
  if (status === 2) return { label: mt.status.pending, glyph: "◷", tone: "neutral" };
  if (status === 6 || status === 7) return { label: mt.status.removed, glyph: "×", tone: "neutral" };
  return null;
}

export function requestBadge(status: RequestStatus): StatusBadge {
  if (status === 1) return { label: mt.requestStatus.pending, glyph: "◷", tone: "urgent" };
  if (status === 2) return { label: mt.requestStatus.approved, glyph: "✓", tone: "accent" };
  if (status === 3) return { label: mt.requestStatus.declined, glyph: "×", tone: "neutral" };
  if (status === 4) return { label: mt.requestStatus.failed, glyph: "!", tone: "urgent" };
  return { label: mt.requestStatus.completed, glyph: "✓", tone: "success" };
}

// A title can be asked for when the server has nothing yet (or only part of a series).
export function canRequest(item: Pick<SeerrResult, "mediaType" | "mediaInfo">, is4k = false) {
  const status = is4k ? item.mediaInfo?.status4k : item.mediaInfo?.status;
  return !status || status === 1 || status === 6 || status === 7 || (item.mediaType === "tv" && status === 4);
}

export type SeasonRow = SeerrSeason & { status: MediaStatus | undefined; requested: boolean; requestable: boolean };

// The series' seasons (specials last are left out, like Seerr does), each with what the server has and whether an
// open request already covers it.
// With is4k, the same for the 4K copy (its own statuses and its own requests).
export function seasonRows(details: Pick<SeerrDetails, "seasons" | "mediaInfo">, is4k = false): SeasonRow[] {
  const onServer = new Map((details.mediaInfo?.seasons ?? []).map((season) => [season.seasonNumber, is4k ? season.status4k : season.status]));
  const asked = new Set<number>();
  for (const request of details.mediaInfo?.requests ?? []) {
    if (request.status === 3 || request.status === 4) continue; // declined or failed: free to ask again
    if (Boolean(request.is4k) !== is4k) continue;
    for (const season of request.seasons ?? []) asked.add(season.seasonNumber);
  }
  return (details.seasons ?? [])
    .filter((season) => season.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .map((season) => {
      const status = onServer.get(season.seasonNumber);
      const requested = asked.has(season.seasonNumber);
      const have = status === 2 || status === 3 || status === 4 || status === 5;
      return { ...season, status, requested, requestable: !requested && !have };
    });
}

export function seasonBadge(row: Pick<SeasonRow, "status" | "requested">): StatusBadge | null {
  return mediaBadge(row.status) ?? (row.requested ? { label: mt.status.pending, glyph: "◷", tone: "neutral" } : null);
}

// The first YouTube trailer, else any YouTube video.
export function trailerUrl(videos: SeerrVideo[] | undefined) {
  const youtube = (videos ?? []).filter((video) => video.site === "YouTube" && (video.key || video.url));
  const pick = youtube.find((video) => video.type === "Trailer") ?? youtube[0];
  if (!pick) return null;
  return pick.url ?? `https://www.youtube.com/watch?v=${pick.key}`;
}

// Where to watch it on the user's own media server, when Seerr knows.
export function playUrl(info: SeerrMediaInfo | undefined) {
  return info?.mediaUrl ?? info?.iOSPlexUrl ?? info?.plexUrl ?? null;
}

// The title's page on the user's Seerr website.
export function seerrPageUrl(serverUrl: string | null, mediaType: SeerrMediaType, tmdbId: number) {
  return serverUrl ? `${serverUrl.replace(/\/+$/, "")}/${mediaType}/${tmdbId}` : null;
}

export function imdbUrl(details: Pick<SeerrDetails, "externalIds" | "imdbId">) {
  const id = details.imdbId ?? details.externalIds?.imdbId;
  return id ? `https://www.imdb.com/title/${id}` : null;
}

// Top-billed cast, each person once.
export function topCast(details: Pick<SeerrDetails, "credits">, count = 15) {
  const seen = new Set<number>();
  return [...(details.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .filter((person) => (seen.has(person.id) ? false : (seen.add(person.id), true)))
    .slice(0, count);
}

// "Directed by" for a movie, "Created by" for a series.
export function makers(details: Pick<SeerrDetails, "mediaType" | "credits" | "createdBy">) {
  const names = details.mediaType === "tv" && details.createdBy?.length ? details.createdBy.map((person) => person.name) : (details.credits?.crew ?? []).filter((person) => person.job === "Director").map((person) => person.name);
  return [...new Set(names)];
}

export function runtimeLabel(minutes: number | undefined) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} ${mt.minutes}`;
  return rest ? `${hours} ${mt.hours} ${rest} ${mt.minutes}` : `${hours} ${mt.hours}`;
}

// One line under the title: Movie · 2024 · 2 h 46 min · ★ 8.2
export function factLine(details: SeerrDetails) {
  const runtime = details.mediaType === "tv" ? details.episodeRunTime?.[0] : details.runtime;
  return [
    details.mediaType === "tv" ? mt.series : mt.movie,
    seerrYear(details) || null,
    details.mediaType === "tv" && details.numberOfSeasons ? `${digits(details.numberOfSeasons)} ${details.numberOfSeasons === 1 ? mt.season : mt.seasons}` : null,
    runtimeLabel(runtime),
    details.voteAverage ? `★ ${digits(details.voteAverage.toFixed(1))}` : null
  ].filter((part): part is string => Boolean(part));
}

const money = (value: number) => digits(`$${value >= 1e9 ? `${(value / 1e9).toFixed(1)}B` : value >= 1e6 ? `${Math.round(value / 1e6)}M` : value.toLocaleString("en")}`);

function languageName(code: string | undefined) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([isArabic ? "ar" : "en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

// The facts table on a title's page, label then value, only the ones Seerr sent.
export function factRows(details: SeerrDetails, formatDay: (value: string) => string): [string, string][] {
  const rows: [string, string | null | undefined][] = [
    [mt.facts.status, details.status ? (mt.releaseStatus[details.status as keyof typeof mt.releaseStatus] ?? details.status) : null],
    [details.mediaType === "tv" ? mt.facts.firstAired : mt.facts.released, details.releaseDate || details.firstAirDate ? formatDay((details.releaseDate || details.firstAirDate)!) : null],
    [mt.facts.lastAired, details.mediaType === "tv" && details.lastAirDate ? formatDay(details.lastAirDate) : null],
    [mt.facts.nextEpisode, details.nextEpisodeToAir?.airDate ? `${formatDay(details.nextEpisodeToAir.airDate)} · S${details.nextEpisodeToAir.seasonNumber ?? "?"} E${details.nextEpisodeToAir.episodeNumber ?? "?"}` : null],
    [mt.facts.episodes, details.numberOfEpisodes ? String(details.numberOfEpisodes) : null],
    [details.mediaType === "tv" ? mt.facts.createdBy : mt.facts.director, makers(details).join(mt.sep) || null],
    [details.mediaType === "tv" ? mt.facts.network : mt.facts.studio, (details.mediaType === "tv" ? details.networks : details.productionCompanies)?.slice(0, 2).map((company) => company.name).join(mt.sep) || null],
    [mt.facts.language, languageName(details.originalLanguage)],
    [mt.facts.originalTitle, (details.originalTitle ?? details.originalName) && (details.originalTitle ?? details.originalName) !== seerrName(details) ? (details.originalTitle ?? details.originalName)! : null],
    [mt.facts.budget, details.budget ? money(details.budget) : null],
    [mt.facts.revenue, details.revenue ? money(details.revenue) : null]
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
}

// "3 of 5 movie requests left this week", or null when there is no limit.
export function quotaLine(part: SeerrQuotaPart | undefined, kind: SeerrMediaType) {
  if (!part?.limit) return null;
  const left = Math.max(0, part.remaining ?? part.limit - (part.used ?? 0));
  return mt.quota(left, part.limit, kind, part.days ?? 7);
}

// A person's credits as posters: newest first, each title once.
export function personCredits(cast: SeerrCredit[] = [], crew: SeerrCredit[] = []) {
  return uniqueResults([...cast, ...crew].filter(isMedia)).sort((a, b) => (seerrYear(b) || "0").localeCompare(seerrYear(a) || "0"));
}

// One Seerr API call: method, path under /api/v1 (no leading slash), optional JSON body.
export type SeerrCall = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => Promise<T>;

// The app never talks to Seerr itself: Orbit's server holds the user's key (encrypted) and passes these calls on
// for that account only (backend/app/routers/integrations.py).
export function serverSeerrCall(api: Pick<ApiClient, "request">): SeerrCall {
  return <T,>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => api.request<T>(method, `/integrations/seerr/api/${path}`, body);
}

function discoverPath(list: DiscoverList) {
  if (list.row === "genre") return `discover/${list.kind === "tv" ? "tv" : "movies"}/genre/${list.genreId}`;
  return { trending: "discover/trending", movies: "discover/movies", tv: "discover/tv", upcomingMovies: "discover/movies/upcoming", upcomingTv: "discover/tv/upcoming" }[list.row];
}

// Discover lists of one kind come back without mediaType on some Seerr versions.
function kindOf(list: DiscoverList): SeerrMediaType | null {
  if (list.row === "genre") return list.kind;
  if (list.row === "movies" || list.row === "upcomingMovies") return "movie";
  if (list.row === "tv" || list.row === "upcomingTv") return "tv";
  return null;
}

export function createSeerrClient(call: SeerrCall) {
  const page = <T extends SeerrResult>(path: string, kind: SeerrMediaType | null = null) =>
    call<SeerrPage<T>>("GET", path).then((body) => ({ ...body, results: uniqueResults(body.results.map((item) => (kind && !item.mediaType ? { ...item, mediaType: kind } : item)).filter(isMedia)) }));
  return {
    status: () => call<{ version: string }>("GET", "status"),
    me: () => call<SeerrUser>("GET", "auth/me"),
    search: (query: string, pageNumber = 1) => page(`search?query=${encodeURIComponent(query)}&page=${pageNumber}`).then((body) => body.results),
    searchPage: (query: string, pageNumber = 1) => page(`search?query=${encodeURIComponent(query)}&page=${pageNumber}`),
    trending: () => page("discover/trending").then((body) => body.results),
    discover: (list: DiscoverList, pageNumber = 1) => page(`${discoverPath(list)}?page=${pageNumber}`, kindOf(list)),
    genres: (kind: SeerrMediaType) => call<{ id: number; name: string }[]>("GET", `genres/${kind}`),
    requests: (take = 20, filter: RequestFilter = "all") => call<SeerrRequestPage>("GET", `request?take=${take}&filter=${filter}&sort=added`).then((body) => body.results),
    requestPage: (filter: RequestFilter, skip = 0, take = 20) => call<SeerrRequestPage>("GET", `request?take=${take}&skip=${skip}&filter=${filter}&sort=added`),
    counts: () => call<SeerrCounts>("GET", "request/count"),
    pendingCount: () => call<SeerrCounts>("GET", "request/count").then((body) => body.pending),
    quota: (userId: number) => call<SeerrQuota>("GET", `user/${userId}/quota`),
    // A movie, or a series: every season ("all", Seerr skips ones already on the server) or the ones picked.
    // With a choice: 4K, and (for people allowed advanced requests) the server, quality profile and folder.
    request: (mediaType: SeerrMediaType, tmdbId: number, seasons: number[] | "all" = "all", choice: RequestChoice = DEFAULT_CHOICE, advanced = false) =>
      call<SeerrRequest>("POST", "request", requestBody(mediaType, tmdbId, seasons, choice, advanced)),
    // Movies go to Radarr, series to Sonarr.
    services: (mediaType: SeerrMediaType) => call<SeerrService[]>("GET", `service/${mediaType === "tv" ? "sonarr" : "radarr"}`),
    service: (mediaType: SeerrMediaType, serverId: number) => call<SeerrServiceDetails>("GET", `service/${mediaType === "tv" ? "sonarr" : "radarr"}/${serverId}`),
    // Requests carry only a TMDB id; this fetches the name and poster to show with them.
    details: (mediaType: SeerrMediaType, tmdbId: number) => call<SeerrDetails>("GET", `${mediaType}/${tmdbId}`).then((item) => ({ ...item, mediaType })),
    season: (tmdbId: number, seasonNumber: number) => call<SeerrSeason & { episodes?: SeerrEpisode[] }>("GET", `tv/${tmdbId}/season/${seasonNumber}`),
    ratings: (tmdbId: number) => call<SeerrRatings>("GET", `movie/${tmdbId}/ratings`),
    recommendations: (mediaType: SeerrMediaType, tmdbId: number) => page(`${mediaType}/${tmdbId}/recommendations`, mediaType).then((body) => body.results),
    similar: (mediaType: SeerrMediaType, tmdbId: number) => page(`${mediaType}/${tmdbId}/similar`, mediaType).then((body) => body.results),
    person: (personId: number) => call<SeerrPerson>("GET", `person/${personId}`),
    personCredits: (personId: number) => call<{ cast?: SeerrCredit[]; crew?: SeerrCredit[] }>("GET", `person/${personId}/combined_credits`).then((body) => personCredits(body.cast, body.crew)),
    approve: (requestId: number) => call<SeerrRequest>("POST", `request/${requestId}/approve`),
    decline: (requestId: number) => call<SeerrRequest>("POST", `request/${requestId}/decline`),
    retry: (requestId: number) => call<SeerrRequest>("POST", `request/${requestId}/retry`),
    cancel: (requestId: number) => call<void>("DELETE", `request/${requestId}`)
  };
}

export type SeerrClient = ReturnType<typeof createSeerrClient>;

// Strings for the Movies & TV screens, English and Arabic.
const en = {
  untitled: "Untitled",
  sep: ", ",
  fetching: "Fetching",
  movie: "Movie",
  series: "TV",
  season: "season",
  seasons: "seasons",
  minutes: "min",
  hours: "h",
  rows: { trending: "Trending", movies: "Popular movies", tv: "Popular series", upcomingMovies: "Coming soon · movies", upcomingTv: "Coming soon · series", genre: "Genre" } as Record<DiscoverRow | "genre", string>,
  seeAll: "See all",
  loadMore: "Load more",
  nothingFound: "Nothing found. Try another name.",
  movieGenres: "Movie genres",
  tvGenres: "Series genres",
  requests: "Requests",
  myRequests: "My requests",
  allRequests: "All requests",
  awaiting: "Awaiting approval",
  requestsEmpty: "No requests here.",
  filters: { all: "All", pending: "Waiting", processing: "Downloading", available: "Available", failed: "Failed" } as Record<RequestFilter, string>,
  status: { available: "Available", partial: "Partly available", processing: "Downloading", pending: "Requested", removed: "Removed" },
  requestStatus: { pending: "Waiting for approval", approved: "Approved", declined: "Declined", failed: "Failed", completed: "Completed" },
  request: "Request",
  requestMore: "Request more seasons",
  requestSeasons: "Request seasons",
  requestAll: "All seasons",
  requestPicked: (count: number) => (count === 1 ? "Request 1 season" : `Request ${digits(count)} seasons`),
  pickSeasons: "Pick the seasons to ask for.",
  quality: "Quality",
  requestOptions: "Request options",
  standard: "Standard",
  request4k: "Request in 4K",
  profile: "Quality profile",
  server: "Server",
  folder: "Folder",
  serverDefault: (name: string) => `Default · ${name}`,
  defaultOnly: "Seerr will use the server's default quality.",
  optionsFailed: "Couldn't load the quality options. The request will use the default.",
  requestedOk: "Requested",
  cancelRequest: "Cancel my request",
  cancelRequestTitle: "Cancel this request?",
  approve: "Approve",
  decline: "Decline",
  retry: "Retry",
  play: "Play",
  trailer: "Trailer",
  openInSeerr: "Open in Seerr",
  imdb: "IMDb",
  overview: "Overview",
  cast: "Cast",
  seasonsTitle: "Seasons",
  episodes: (count: number) => (count === 1 ? "1 episode" : `${digits(count)} episodes`),
  noEpisodes: "No episode list yet.",
  recommended: "Recommended",
  similar: "Similar",
  details: "Details",
  ratings: "Ratings",
  tmdb: "TMDB",
  critics: "Critics",
  audience: "Audience",
  votes: (count: number) => `${digits(count.toLocaleString("en"))} votes`,
  requestedBy: "Requested by",
  seasonsAsked: (list: string) => `Seasons ${list}`,
  fourK: "4K",
  knownFor: "Known for",
  born: "Born",
  died: "Died",
  biography: "Biography",
  more: "More",
  less: "Less",
  quota: (left: number, limit: number, kind: SeerrMediaType, days: number) => `${left} of ${limit} ${kind === "tv" ? "series" : "movie"} requests left · every ${days} days`,
  facts: { status: "Status", released: "Released", firstAired: "First aired", lastAired: "Last aired", nextEpisode: "Next episode", episodes: "Episodes", director: "Director", createdBy: "Created by", studio: "Studio", network: "Network", language: "Original language", originalTitle: "Original title", budget: "Budget", revenue: "Box office" },
  releaseStatus: { Released: "Released", "Post Production": "Post production", "In Production": "In production", Planned: "Planned", Rumored: "Rumored", Canceled: "Canceled", "Returning Series": "Still running", Ended: "Ended", Pilot: "Pilot" } as Record<string, string>,
  watchList: "My watch list",
  disconnectSeerr: "Disconnect Seerr"
};

const ar: typeof en = {
  untitled: "بدون اسم",
  sep: "، ",
  fetching: "يتحمّل",
  movie: "فيلم",
  series: "مسلسل",
  season: "موسم",
  seasons: "مواسم",
  minutes: "د",
  hours: "س",
  rows: { trending: "الرائج", movies: "أفلام مشهورة", tv: "مسلسلات مشهورة", upcomingMovies: "قريبًا · أفلام", upcomingTv: "قريبًا · مسلسلات", genre: "تصنيف" },
  seeAll: "الكل",
  loadMore: "عرض المزيد",
  nothingFound: "ما لقينا شي. جرّب اسمًا ثانيًا.",
  movieGenres: "تصنيفات الأفلام",
  tvGenres: "تصنيفات المسلسلات",
  requests: "الطلبات",
  myRequests: "طلباتي",
  allRequests: "كل الطلبات",
  awaiting: "تنتظر الموافقة",
  requestsEmpty: "لا توجد طلبات هنا.",
  filters: { all: "الكل", pending: "تنتظر", processing: "يتحمّل", available: "متوفر", failed: "فشل" },
  status: { available: "متوفر", partial: "متوفر جزئيًا", processing: "يتحمّل", pending: "مطلوب", removed: "محذوف" },
  requestStatus: { pending: "ينتظر الموافقة", approved: "تمت الموافقة", declined: "مرفوض", failed: "فشل", completed: "اكتمل" },
  request: "اطلب",
  requestMore: "اطلب مواسم أخرى",
  requestSeasons: "اطلب مواسم",
  requestAll: "كل المواسم",
  requestPicked: (count: number) => (count === 1 ? "اطلب موسمًا واحدًا" : `اطلب ${digits(count)} مواسم`),
  pickSeasons: "اختر المواسم اللي تبيها.",
  quality: "الجودة",
  requestOptions: "خيارات الطلب",
  standard: "عادية",
  request4k: "اطلب بجودة 4K",
  profile: "ملف الجودة",
  server: "الخادم",
  folder: "المجلد",
  // The name is isolated so a path like /data/tv keeps its slash in place inside Arabic text.
  serverDefault: (name: string) => `الافتراضي · \u2068${name}\u2069`,
  defaultOnly: "بيستخدم Seerr الجودة الافتراضية للخادم.",
  optionsFailed: "ما قدرنا نجيب خيارات الجودة. الطلب بيروح بالافتراضي.",
  requestedOk: "انطلب",
  cancelRequest: "ألغِ طلبي",
  cancelRequestTitle: "تلغي هذا الطلب؟",
  approve: "موافقة",
  decline: "رفض",
  retry: "أعد المحاولة",
  play: "شغّل",
  trailer: "الإعلان",
  openInSeerr: "افتح في Seerr",
  imdb: "IMDb",
  overview: "القصة",
  cast: "الممثلون",
  seasonsTitle: "المواسم",
  episodes: (count: number) => (count === 1 ? "حلقة واحدة" : `${digits(count)} حلقة`),
  noEpisodes: "لا توجد قائمة حلقات بعد.",
  recommended: "ننصحك فيه",
  similar: "مشابه",
  details: "التفاصيل",
  ratings: "التقييم",
  tmdb: "TMDB",
  critics: "النقاد",
  audience: "الجمهور",
  votes: (count: number) => `${digits(count.toLocaleString("en"))} صوت`,
  requestedBy: "طلبه",
  seasonsAsked: (list: string) => `المواسم ${list}`,
  fourK: "4K",
  knownFor: "معروف بـ",
  born: "الميلاد",
  died: "الوفاة",
  biography: "نبذة",
  more: "المزيد",
  less: "أقل",
  quota: (left: number, limit: number, kind: SeerrMediaType, days: number) => `باقي ${left} من ${limit} طلبات ${kind === "tv" ? "مسلسلات" : "أفلام"} · كل ${days} أيام`,
  facts: { status: "الحالة", released: "تاريخ العرض", firstAired: "أول عرض", lastAired: "آخر عرض", nextEpisode: "الحلقة الجاية", episodes: "الحلقات", director: "المخرج", createdBy: "من تأليف", studio: "الإنتاج", network: "القناة", language: "اللغة الأصلية", originalTitle: "الاسم الأصلي", budget: "الميزانية", revenue: "الإيرادات" },
  releaseStatus: { Released: "معروض", "Post Production": "في المونتاج", "In Production": "قيد التصوير", Planned: "مخطط له", Rumored: "إشاعة", Canceled: "ملغي", "Returning Series": "مستمر", Ended: "انتهى", Pilot: "حلقة تجريبية" },
  watchList: "قائمة مشاهدتي",
  disconnectSeerr: "افصل Seerr"
};

export const mt = isArabic ? ar : en;
