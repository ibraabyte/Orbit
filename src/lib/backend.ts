import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createApiClient, type ApiClient } from "@/lib/api";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";

// Which server the app talks to. EXPO_PUBLIC_API_URL (Orbit's own server) wins; Supabase stays as the
// fallback until every screen has moved over.
export type BackendMode = "api" | "supabase" | "none";

export function backendMode(): BackendMode {
  if (process.env.EXPO_PUBLIC_API_URL) return "api";
  return hasSupabaseEnv() ? "supabase" : "none";
}

const SESSION_KEY = "orbit.api.session";
let client: ApiClient | null = null;

export function getApi() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) throw new Error("Missing EXPO_PUBLIC_API_URL.");
  client ??= createApiClient({
    baseUrl,
    device: Platform.OS,
    storage: {
      get: () => SecureStore.getItemAsync(SESSION_KEY),
      set: (value) => SecureStore.setItemAsync(SESSION_KEY, value),
      remove: () => SecureStore.deleteItemAsync(SESSION_KEY)
    }
  });
  return client;
}

export type AppSession = { userId: string };

// One session shape for both servers, so screens don't care which one is behind them.
export function watchSession(onChange: (session: AppSession | null) => void) {
  const mode = backendMode();
  if (mode === "api") {
    const api = getApi();
    void api.restore().then(onChange);
    return api.onSessionChange(onChange);
  }
  if (mode === "supabase") {
    const supabase = getSupabase();
    const toSession = (user: { id: string } | null | undefined) => (user ? { userId: user.id } : null);
    void supabase.auth.getSession().then(({ data }) => onChange(toSession(data.session?.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => onChange(toSession(next?.user)));
    return () => data.subscription.unsubscribe();
  }
  onChange(null);
  return () => undefined;
}

export async function signOut() {
  if (backendMode() === "api") await getApi().signOut();
  else await getSupabase().auth.signOut();
}
