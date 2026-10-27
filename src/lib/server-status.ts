export type Server = { id: string; name: string; url: string };
export type ServerCheck = { id: string; up: boolean; ms: number | null; detail: string; checkedAt: string };

export function normalizeServerUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Any HTTP answer below 500 counts as up: a login page (401/403) still means the server is alive.
export async function checkServer(server: Server, fetcher: typeof fetch = fetch, timeoutMs = 8000, now = () => Date.now()): Promise<ServerCheck> {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(server.url, { method: "GET", signal: controller.signal });
    const up = response.status < 500;
    return { id: server.id, up, ms: now() - started, detail: up ? `HTTP ${response.status}` : `Server error ${response.status}`, checkedAt: new Date(started).toISOString() };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    return { id: server.id, up: false, ms: null, detail: timedOut ? `No answer in ${timeoutMs / 1000}s` : error instanceof Error ? error.message : "Unreachable", checkedAt: new Date(started).toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

// Which servers changed state since the last round (for "X is down" / "X is back" alerts).
export function statusChanges(previous: ServerCheck[], next: ServerCheck[]) {
  const before = new Map(previous.map((check) => [check.id, check.up]));
  return next.filter((check) => before.has(check.id) && before.get(check.id) !== check.up);
}
