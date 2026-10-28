import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "@/lib/types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function hasSupabaseEnv() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

// Local Supabase (`supabase start`): a phone can't reach 127.0.0.1, so in dev use the
// same Mac address the phone already uses for Metro. That address changes per Wi-Fi.
export function resolveSupabaseUrl(url: string, hostUri = Constants.expoConfig?.hostUri) {
  const devHost = hostUri?.split(":")[0];
  return devHost ? url.replace(/\/\/(127\.0\.0\.1|localhost)(?=[:/]|$)/, `//${devHost}`) : url;
}

export function getSupabase() {
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const url = envUrl && resolveSupabaseUrl(envUrl);
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }

  client ??= createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  return client;
}
