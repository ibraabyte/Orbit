import type { ApiClient } from "@/lib/api";

// Minimal Seerr (Overseerr / Jellyseerr) API client. Same /api/v1 for all three.
// The server URL and API key are entered in the app once and kept, encrypted, on Orbit's server for this account.

// What older versions of the app kept in the phone's secure store; moved to the server on first open.
export type SeerrConfig = { url: string; apiKey: string };
export type SeerrMediaType = "movie" | "tv";

// mediaInfo.status: what the server has. request.status: what happened to the ask.
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
  overview?: string;
  mediaInfo?: { status: keyof typeof MEDIA_STATUS };
};

export type SeerrRequest = {
  id: number;
  status: keyof typeof REQUEST_STATUS;
  createdAt: string;
  type: SeerrMediaType;
  media: { tmdbId: number; status: keyof typeof MEDIA_STATUS; mediaType: SeerrMediaType };
  requestedBy?: { displayName?: string };
};

export type SeerrUser = { id: number; displayName?: string; permissions: number };

const ADMIN = 2;
const MANAGE_REQUESTS = 16;

export function normalizeSeerrUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function canManageRequests(user: Pick<SeerrUser, "permissions">) {
  return (user.permissions & (ADMIN | MANAGE_REQUESTS)) !== 0;
}

export function seerrTitle(item: Pick<SeerrResult, "title" | "name" | "releaseDate" | "firstAirDate">) {
  const year = (item.releaseDate ?? item.firstAirDate ?? "").slice(0, 4);
  return `${item.title ?? item.name ?? "Untitled"}${year ? ` (${year})` : ""}`;
}

export function posterUrl(posterPath: string | null | undefined, width: 185 | 342 | 500 = 342) {
  return posterPath ? `https://image.tmdb.org/t/p/w${width}${posterPath}` : null;
}

// One Seerr API call: method, path under /api/v1 (no leading slash), optional JSON body.
export type SeerrCall = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => Promise<T>;

// The app never talks to Seerr itself: Orbit's server holds the user's key (encrypted) and passes these calls on
// for that account only (backend/app/routers/integrations.py).
export function serverSeerrCall(api: Pick<ApiClient, "request">): SeerrCall {
  return <T,>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => api.request<T>(method, `/integrations/seerr/api/${path}`, body);
}

export function createSeerrClient(call: SeerrCall) {
  return {
    status: () => call<{ version: string }>("GET", "status"),
    me: () => call<SeerrUser>("GET", "auth/me"),
    search: (query: string, page = 1) =>
      call<{ results: SeerrResult[] }>("GET", `search?query=${encodeURIComponent(query)}&page=${page}`).then((body) => body.results.filter((item) => item.mediaType !== "person")),
    trending: () => call<{ results: SeerrResult[] }>("GET", "discover/trending").then((body) => body.results.filter((item) => item.mediaType !== "person")),
    requests: (take = 20, filter: "all" | "pending" | "approved" | "available" = "all") =>
      call<{ results: SeerrRequest[] }>("GET", `request?take=${take}&filter=${filter}&sort=added`).then((body) => body.results),
    pendingCount: () => call<{ pending: number }>("GET", "request/count").then((body) => body.pending),
    // Asks for every season of a series; Seerr skips ones already on the server.
    request: (mediaType: SeerrMediaType, tmdbId: number) =>
      call<SeerrRequest>("POST", "request", mediaType === "tv" ? { mediaType, mediaId: tmdbId, seasons: "all" } : { mediaType, mediaId: tmdbId }),
    // Requests carry only a TMDB id; this fetches the name and poster to show with them.
    details: (mediaType: SeerrMediaType, tmdbId: number) => call<SeerrResult>("GET", `${mediaType}/${tmdbId}`),
    approve: (requestId: number) => call<SeerrRequest>("POST", `request/${requestId}/approve`),
    decline: (requestId: number) => call<SeerrRequest>("POST", `request/${requestId}/decline`),
    cancel: (requestId: number) => call<void>("DELETE", `request/${requestId}`)
  };
}

export type SeerrClient = ReturnType<typeof createSeerrClient>;
