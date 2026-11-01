import type { ApiClient } from "@/lib/api";
import { syncedAgo } from "@/lib/whoop";

// Every connection is set up by the user from the app, for their account only. The server holds the secrets
// (WHOOP tokens, the Seerr key) encrypted; the only server-wide pieces are WHOOP's app keys and the AI key.
// Shapes mirror backend/app/routers/integrations.py and admin.py.

export type SeerrStatus = { connected: boolean; url: string | null; account_name: string | null; connected_at: string | null };

export type IntegrationsOverview = {
  whoop: { configured: boolean; connected: boolean; last_synced_at: string | null; last_sync_error: string | null };
  seerr: SeerrStatus;
  ai: { configured: boolean };
};

export type Me = { id: string; email: string; is_admin: boolean };
export type ServerSettings = { signups_open: boolean; signups_forced_by_server: boolean };

type Api = Pick<ApiClient, "get" | "put" | "patch" | "delete">;

export const integrationsApi = {
  overview: (api: Api) => api.get<IntegrationsOverview>("/integrations"),
  seerr: (api: Api) => api.get<SeerrStatus>("/integrations/seerr"),
  connectSeerr: (api: Api, url: string, apiKey: string) => api.put<SeerrStatus>("/integrations/seerr", { url: url.trim(), api_key: apiKey.trim() }),
  disconnectSeerr: (api: Api) => api.delete("/integrations/seerr")
};

export const adminApi = {
  me: (api: Api) => api.get<Me>("/auth/me"),
  settings: (api: Api) => api.get<ServerSettings>("/admin/settings"),
  setSignupsOpen: (api: Api, open: boolean) => api.patch<ServerSettings>("/admin/settings", { signups_open: open })
};

// Same names as the badge tones in components/drift.tsx.
export type IntegrationState = { label: string; tone: "neutral" | "success" | "warning"; detail: string };

export function whoopState(whoop: IntegrationsOverview["whoop"], now = new Date()): IntegrationState {
  if (!whoop.configured) return { label: "Not available", tone: "neutral", detail: "This Orbit server hasn't turned WHOOP on yet." };
  if (!whoop.connected) return { label: "Not connected", tone: "neutral", detail: "Sign in with WHOOP to bring in recovery, sleep and strain." };
  if (whoop.last_sync_error) return { label: "Needs attention", tone: "warning", detail: whoop.last_sync_error };
  return { label: "Connected", tone: "success", detail: syncedAgo(whoop.last_synced_at, now) };
}

export function seerrState(seerr: SeerrStatus): IntegrationState {
  if (!seerr.connected) return { label: "Not connected", tone: "neutral", detail: "Add your Seerr server's address and API key." };
  const host = seerr.url ? seerr.url.replace(/^https?:\/\//, "") : "your server";
  return { label: "Connected", tone: "success", detail: seerr.account_name ? `${host} as ${seerr.account_name}` : host };
}

export function aiState(ai: IntegrationsOverview["ai"]): IntegrationState {
  return ai.configured
    ? { label: "On", tone: "success", detail: "Written summaries for WHOOP, provided by this server." }
    : { label: "Off", tone: "neutral", detail: "This Orbit server hasn't turned on AI summaries." };
}
