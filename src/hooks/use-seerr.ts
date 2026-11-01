import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApi } from "@/lib/backend";
import { integrationsApi, type SeerrStatus } from "@/lib/integrations";
import { canManageRequests, createSeerrClient, serverSeerrCall, type SeerrConfig, type SeerrUser } from "@/lib/seerr";

// Where older versions of the app kept the URL and key, on the phone only.
const LEGACY_KEY = "orbit.seerr";

// Seerr is connected per account: the URL and key are saved on Orbit's server (key encrypted), so it works on every
// phone you sign in on, and every call goes through the server with your key only.
export function useSeerr() {
  const [status, setStatus] = useState<SeerrStatus | null>(null);
  const [user, setUser] = useState<SeerrUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const api = getApi();
        let next = await integrationsApi.seerr(api);
        // One-time move of a key saved on this phone by an older version.
        const legacy = next.connected ? null : await SecureStore.getItemAsync(LEGACY_KEY).catch(() => null);
        if (legacy) {
          const saved = JSON.parse(legacy) as SeerrConfig;
          next = await integrationsApi.connectSeerr(api, saved.url, saved.apiKey);
          await SecureStore.deleteItemAsync(LEGACY_KEY);
        }
        if (live) setStatus(next);
      } catch (loadError) {
        if (live) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const client = useMemo(() => (status?.connected ? createSeerrClient(serverSeerrCall(getApi())) : null), [status?.connected, status?.url]);

  useEffect(() => {
    if (!client) return setUser(null);
    client
      .me()
      .then((me) => {
        setUser(me);
        setError(null);
      })
      .catch((meError: Error) => setError(meError.message));
  }, [client]);

  // The server checks the URL and key against Seerr before saving them.
  const connect = useCallback(async (url: string, apiKey: string) => {
    const next = await integrationsApi.connectSeerr(getApi(), url, apiKey);
    setStatus(next);
    setError(null);
  }, []);

  const disconnect = useCallback(async () => {
    await integrationsApi.disconnectSeerr(getApi());
    await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
    setStatus({ connected: false, url: null, account_name: null, connected_at: null });
  }, []);

  return {
    ready,
    status,
    connected: Boolean(client),
    serverUrl: status?.url ?? null,
    client,
    user,
    isAdmin: user ? canManageRequests(user) : false,
    error,
    connect,
    disconnect
  };
}
