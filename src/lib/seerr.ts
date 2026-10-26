// Minimal Seerr (Overseerr / Jellyseerr) API client. Same /api/v1 for all three.
// The server URL and API key are entered in the app and kept in the phone's secure store.

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

export function createSeerrClient(config: SeerrConfig, fetcher: typeof fetch = fetch) {
  const base = `${normalizeSeerrUrl(config.url)}/api/v1`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: { "X-Api-Key": config.apiKey, "Content-Type": "application/json", Accept: "application/json", ...init.headers }
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Seerr rejected the API key.");
      throw new Error(`Seerr error ${response.status}.`);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  return {
    status: () => call<{ version: string }>("/status"),
    me: () => call<SeerrUser>("/auth/me"),
    search: (query: string, page = 1) =>
      call<{ results: SeerrResult[] }>(`/search?query=${encodeURIComponent(query)}&page=${page}`).then((body) => body.results.filter((item) => item.mediaType !== "person")),
    trending: () => call<{ results: SeerrResult[] }>("/discover/trending").then((body) => body.results.filter((item) => item.mediaType !== "person")),
    requests: (take = 20, filter: "all" | "pending" | "approved" | "available" = "all") =>
      call<{ results: SeerrRequest[] }>(`/request?take=${take}&filter=${filter}&sort=added`).then((body) => body.results),
    pendingCount: () => call<{ pending: number }>("/request/count").then((body) => body.pending),
    // Asks for every season of a series; Seerr skips ones already on the server.
    request: (mediaType: SeerrMediaType, tmdbId: number) =>
      call<SeerrRequest>("/request", { method: "POST", body: JSON.stringify(mediaType === "tv" ? { mediaType, mediaId: tmdbId, seasons: "all" } : { mediaType, mediaId: tmdbId }) }),
    // Requests carry only a TMDB id; this fetches the name and poster to show with them.
    details: (mediaType: SeerrMediaType, tmdbId: number) => call<SeerrResult>(`/${mediaType}/${tmdbId}`),
    approve: (requestId: number) => call<SeerrRequest>(`/request/${requestId}/approve`, { method: "POST" }),
    decline: (requestId: number) => call<SeerrRequest>(`/request/${requestId}/decline`, { method: "POST" }),
    cancel: (requestId: number) => call<void>(`/request/${requestId}`, { method: "DELETE" })
  };
}

export type SeerrClient = ReturnType<typeof createSeerrClient>;
