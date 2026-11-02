import type { ApiClient } from "@/lib/api";
import { t } from "@/lib/i18n";
import { syncedAgo } from "@/lib/whoop";

// Every connection is set up by the user from the app, for their account only. The server holds the secrets
// (WHOOP tokens, the Seerr and AI keys) encrypted; the only server-wide pieces are WHOOP's app keys and the admin's AI key.
// Shapes mirror backend/app/routers/integrations.py and admin.py.

export type SeerrStatus = { connected: boolean; url: string | null; account_name: string | null; connected_at: string | null };

export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "openrouter"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_PROVIDER_NAMES: Record<AiProvider, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", openrouter: "OpenRouter" };

export type AiStatus = { configured: boolean; connected: boolean; provider: AiProvider | null; model: string | null; instructions: string | null; connected_at: string | null };
export type AiConnectInput = { provider: AiProvider; model: string; apiKey: string; instructions: string };
export type ChatgptStatus = { status: "not_connected" | "pending" | "connected" | "expired" };
export type ChatgptStart = ChatgptStatus & { authorization_url: string };

export type IntegrationsOverview = {
  whoop: { configured: boolean; connected: boolean; last_synced_at: string | null; last_sync_error: string | null };
  seerr: SeerrStatus;
  ai: AiStatus;
  chatgpt: ChatgptStatus;
};

export type Me = { id: string; email: string; is_admin: boolean };
export type ServerSettings = { signups_open: boolean; signups_forced_by_server: boolean };

type Api = Pick<ApiClient, "get" | "put" | "patch" | "delete">;
type ChatgptApi = Pick<ApiClient, "get" | "post" | "delete">;

export const integrationsApi = {
  overview: (api: Api) => api.get<IntegrationsOverview>("/integrations"),
  seerr: (api: Api) => api.get<SeerrStatus>("/integrations/seerr"),
  connectSeerr: (api: Api, url: string, apiKey: string) => api.put<SeerrStatus>("/integrations/seerr", { url: url.trim(), api_key: apiKey.trim() }),
  disconnectSeerr: (api: Api) => api.delete("/integrations/seerr"),
  connectAi: (api: Api, { provider, model, apiKey, instructions }: AiConnectInput) =>
    // No api_key means "keep the saved one".
    api.put<AiStatus>("/integrations/ai", { provider, model: model.trim(), ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}), instructions: instructions.trim() }),
  disconnectAi: (api: Api) => api.delete("/integrations/ai"),
  chatgpt: (api: ChatgptApi) => api.get<ChatgptStatus>("/integrations/chatgpt"),
  startChatgpt: (api: ChatgptApi) => api.post<ChatgptStart>("/integrations/chatgpt/start"),
  finishChatgpt: (api: ChatgptApi, callbackUrl: string) => api.post<ChatgptStatus>("/integrations/chatgpt/finish", { callback_url: callbackUrl.trim() }),
  disconnectChatgpt: (api: ChatgptApi) => api.delete("/integrations/chatgpt")
};

// Only Claude has a default model. A saved key only stands in for its own provider.
export function aiFormReady(form: Pick<AiConnectInput, "provider" | "model" | "apiKey">, savedProvider: AiProvider | null): boolean {
  if (form.provider !== "anthropic" && !form.model.trim()) return false;
  return Boolean(form.apiKey.trim()) || form.provider === savedProvider;
}

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

export function chatgptState(chatgpt: ChatgptStatus): IntegrationState {
  switch (chatgpt.status) {
    case "pending": return { label: t.chatgptPending, tone: "warning", detail: t.chatgptPendingDetail };
    case "connected": return { label: t.chatgptConnected, tone: "success", detail: t.chatgptConnectedDetail };
    case "expired": return { label: t.chatgptExpired, tone: "warning", detail: t.chatgptExpiredDetail };
    default: return { label: t.chatgptNotConnected, tone: "neutral", detail: t.chatgptNotConnectedDetail };
  }
}

export function aiState(ai: AiStatus, chatgpt?: ChatgptStatus): IntegrationState {
  if (chatgpt?.status === "connected") return chatgptState(chatgpt);
  if (ai.connected && ai.provider) return { label: "Connected", tone: "success", detail: `${AI_PROVIDER_NAMES[ai.provider]} · ${ai.model}` };
  if (ai.configured) return { label: "Server key", tone: "success", detail: "You're the admin, so summaries use this server's key. Add your own to use your account." };
  return { label: "Not connected", tone: "neutral", detail: "Add your own API key to get written WHOOP summaries." };
}
