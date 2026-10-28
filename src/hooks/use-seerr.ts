import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canManageRequests, createSeerrClient, normalizeSeerrUrl, type SeerrConfig, type SeerrUser } from "@/lib/seerr";

const CONFIG_KEY = "orbit.seerr";

// The API key never leaves the phone: it's typed in Settings and kept in the iOS Keychain / Android Keystore.
export function useSeerr() {
  const [config, setConfig] = useState<SeerrConfig | null>(null);
  const [user, setUser] = useState<SeerrUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(CONFIG_KEY)
      .then((raw) => setConfig(raw ? (JSON.parse(raw) as SeerrConfig) : null))
      .finally(() => setReady(true));
  }, []);

  const client = useMemo(() => (config ? createSeerrClient(config) : null), [config]);

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

  // Checks the URL and key against the server before saving them.
  const connect = useCallback(async (url: string, apiKey: string) => {
    const next = { url: normalizeSeerrUrl(url), apiKey: apiKey.trim() };
    const me = await createSeerrClient(next).me();
    await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(next));
    setConfig(next);
    setUser(me);
    setError(null);
  }, []);

  const disconnect = useCallback(async () => {
    await SecureStore.deleteItemAsync(CONFIG_KEY);
    setConfig(null);
  }, []);

  return { ready, connected: Boolean(client), serverUrl: config?.url ?? null, client, user, isAdmin: user ? canManageRequests(user) : false, error, connect, disconnect };
}
