// Client for Orbit's own server (backend/). Plain TypeScript so it can be tested without React Native.
//
// The access token lives only in memory. The refresh token and user id are kept in `storage` (SecureStore
// in the app) so the session survives restarts, and the app can open offline with its cached data. Refreshes run one at a time: the server treats a refresh token used
// twice as stolen and ends the session, so parallel 401s must share a single refresh.

export type ApiSession = { userId: string };

export type TokenStorage = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  remove(): Promise<void>;
};

type Tokens = { access_token: string; refresh_token: string; expires_in: number; user_id: string };
type Saved = { refreshToken: string; userId: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// FastAPI sends `detail` as a string, or as a list of validation errors for bad input.
export function errorMessage(status: number, body: unknown) {
  const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : null)).filter(Boolean);
    if (messages.length) return messages.join("\n");
  }
  if (status >= 500) return "The server had a problem. Try again.";
  return `Request failed (${status}).`;
}

export function createApiClient({
  baseUrl,
  storage,
  fetch: fetchImpl = fetch,
  device
}: {
  baseUrl: string;
  storage: TokenStorage;
  fetch?: typeof fetch;
  device?: string;
}) {
  const root = baseUrl.replace(/\/+$/, "");
  const listeners = new Set<(session: ApiSession | null) => void>();
  let session: ApiSession | null = null;
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;

  function setSession(next: ApiSession | null) {
    const changed = next?.userId !== session?.userId;
    session = next;
    if (changed) listeners.forEach((listener) => listener(next));
  }

  async function send(method: string, path: string, body: unknown, token: string | null) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetchImpl(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, "Can't reach the Orbit server. Check your connection.");
    }
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { response, parsed };
  }

  async function readSaved(): Promise<Saved | null> {
    try {
      const saved = JSON.parse((await storage.get()) ?? "null") as Saved | null;
      return saved?.refreshToken && saved.userId ? saved : null;
    } catch {
      return null;
    }
  }

  async function accept(tokens: Tokens) {
    accessToken = tokens.access_token;
    await storage.set(JSON.stringify({ refreshToken: tokens.refresh_token, userId: tokens.user_id } satisfies Saved));
    setSession({ userId: tokens.user_id });
    return session as ApiSession;
  }

  async function forget() {
    accessToken = null;
    await storage.remove();
    setSession(null);
  }

  // Returns false when the session is over (no token, or the server refused it).
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const saved = await readSaved();
        if (!saved) {
          await forget();
          return false;
        }
        const { response, parsed } = await send("POST", "/auth/refresh", { refresh_token: saved.refreshToken }, null);
        if (response.ok) {
          await accept(parsed as Tokens);
          return true;
        }
        // Only a definite "no" ends the session; a server error keeps the token for the next try.
        if (response.status === 401) await forget();
        else throw new ApiError(response.status, errorMessage(response.status, parsed));
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    if (!accessToken && !(await refresh())) throw new ApiError(401, "Signed out. Sign in again.");
    let { response, parsed } = await send(method, path, body, accessToken);
    if (response.status === 401) {
      if (!(await refresh())) throw new ApiError(401, "Signed out. Sign in again.");
      ({ response, parsed } = await send(method, path, body, accessToken));
    }
    if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, parsed));
    return parsed as T;
  }

  async function authenticate(path: string, body: Record<string, unknown>) {
    const { response, parsed } = await send("POST", path, { ...body, device }, null);
    if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, parsed));
    return accept(parsed as Tokens);
  }

  return {
    get session() {
      return session;
    },

    onSessionChange(listener: (session: ApiSession | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // On app start. A saved session counts as signed in straight away, so the app opens offline
    // with its cached data; the refresh behind it signs out only if the server refuses the token.
    async restore(): Promise<ApiSession | null> {
      const saved = await readSaved();
      if (!saved) return null;
      setSession({ userId: saved.userId });
      await refresh().catch(() => undefined);
      return session;
    },

    async signupsOpen() {
      const { response, parsed } = await send("GET", "/auth/status", undefined, null);
      return response.ok && Boolean((parsed as { signups_open?: boolean })?.signups_open);
    },

    signIn(email: string, password: string) {
      return authenticate("/auth/sign-in", { email: email.trim(), password });
    },

    signUp(input: { email: string; password: string; displayName?: string; timezone?: string }) {
      return authenticate("/auth/sign-up", {
        email: input.email.trim(),
        password: input.password,
        display_name: input.displayName?.trim() || null,
        timezone: input.timezone ?? "UTC"
      });
    },

    async signOut() {
      const saved = await readSaved();
      // Ending the session locally never waits on the network.
      await forget();
      if (saved) await send("POST", "/auth/sign-out", { refresh_token: saved.refreshToken }, null).catch(() => undefined);
    },

    request,
    get: <T = unknown>(path: string) => request<T>("GET", path),
    post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
    put: <T = unknown>(path: string, body: unknown) => request<T>("PUT", path, body),
    patch: <T = unknown>(path: string, body: unknown) => request<T>("PATCH", path, body),
    delete: (path: string) => request<null>("DELETE", path)
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
