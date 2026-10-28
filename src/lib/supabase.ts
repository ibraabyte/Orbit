import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { NOT_ON_SERVER_YET } from "@/lib/api";
import type { Database } from "@/lib/types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function hasSupabaseEnv() {
  return Boolean(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase() {
  // With Orbit's own server configured, a screen still calling Supabase hasn't been moved over yet.
  if (process.env.EXPO_PUBLIC_API_URL) throw new Error(NOT_ON_SERVER_YET);
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
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
