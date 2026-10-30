import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createApiClient, type ApiClient } from "@/lib/api";

// Orbit's own server (backend/). Without EXPO_PUBLIC_API_URL the app has nowhere to sign in.
export function hasServer() {
  return Boolean(process.env.EXPO_PUBLIC_API_URL);
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

export function watchSession(onChange: (session: AppSession | null) => void) {
  if (!hasServer()) {
    onChange(null);
    return () => undefined;
  }
  const api = getApi();
  void api.restore().then(onChange);
  return api.onSessionChange(onChange);
}

export async function signOut() {
  if (hasServer()) await getApi().signOut();
}
