import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { checkServer, normalizeServerUrl, statusChanges, type Server, type ServerCheck } from "@/lib/server-status";

const SERVERS_KEY = "orbit.servers";
const CHECK_EVERY_MS = 5 * 60_000;

// ponytail: checks run only while Orbit is open (on launch, on return, every 5 min).
// Round-the-clock alerts need a Supabase Edge Function on a cron; add when wanted.
function useServerStatusSource() {
  const [servers, setServers] = useState<Server[]>([]);
  const [checks, setChecks] = useState<ServerCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const last = useRef<ServerCheck[]>([]);

  useEffect(() => {
    void AsyncStorage.getItem(SERVERS_KEY).then((raw) => setServers(raw ? (JSON.parse(raw) as Server[]) : []));
  }, []);

  const save = useCallback(async (next: Server[]) => {
    setServers(next);
    await AsyncStorage.setItem(SERVERS_KEY, JSON.stringify(next));
  }, []);

  const checkAll = useCallback(async () => {
    if (!servers.length) return setChecks([]);
    setChecking(true);
    const next = await Promise.all(servers.map((server) => checkServer(server)));
    for (const change of statusChanges(last.current, next)) {
      const name = servers.find((server) => server.id === change.id)?.name ?? "Server";
      void Notifications.scheduleNotificationAsync({
        content: { title: change.up ? `${name} is back up` : `${name} is down`, body: change.detail },
        trigger: null
      });
    }
    last.current = next;
    setChecks(next);
    setChecking(false);
  }, [servers]);

  useEffect(() => {
    void checkAll();
    const timer = setInterval(() => void checkAll(), CHECK_EVERY_MS);
    const subscription = AppState.addEventListener("change", (state) => state === "active" && void checkAll());
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [checkAll]);

  const add = useCallback((name: string, url: string) => save([...servers, { id: `${Date.now()}`, name: name.trim() || url, url: normalizeServerUrl(url) }]), [save, servers]);
  const remove = useCallback((id: string) => save(servers.filter((server) => server.id !== id)), [save, servers]);

  return { servers, checks, checking, checkAll, add, remove };
}

const ServerStatusContext = createContext<ReturnType<typeof useServerStatusSource> | null>(null);

// One checker for the whole app, so alerts fire once whichever screen is open.
export function ServerStatusProvider({ children }: { children: ReactNode }) {
  return createElement(ServerStatusContext.Provider, { value: useServerStatusSource() }, children);
}

export function useServerStatus() {
  const value = useContext(ServerStatusContext);
  if (!value) throw new Error("useServerStatus must be used inside ServerStatusProvider.");
  return value;
}
