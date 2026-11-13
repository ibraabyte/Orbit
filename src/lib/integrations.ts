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

// Every AI the user can pick: their ChatGPT account or a provider with their own key.
export type AiChoiceName = "chatgpt" | AiProvider;
export const AI_CHOICE_NAMES: Record<AiChoiceName, string> = { chatgpt: "ChatGPT", ...AI_PROVIDER_NAMES };
export type AiChoice = { provider: AiChoiceName; model: string | null; instructions: string | null; connected_at: string | null; is_default: boolean };
// choices: in the order the server falls back through. default: used when the app doesn't pick. server_key: the admin's own key stands in.
export type AiChoices = { choices: AiChoice[]; default: AiChoiceName | null; server_key: boolean };

// The optional voice model for the assistant's mic. Not connected: the phone turns speech into text itself.
export const VOICE_PROVIDERS = ["openai", "groq", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
export const VOICE_PROVIDER_NAMES: Record<VoiceProvider, string> = { openai: "OpenAI", groq: "Groq", elevenlabs: "ElevenLabs" };
// What the server uses when the model is left empty (backend/app/services/voice_stt.py DEFAULT_MODELS).
export const VOICE_DEFAULT_MODELS: Record<VoiceProvider, string> = { openai: "gpt-4o-transcribe", groq: "whisper-large-v3", elevenlabs: "scribe_v1" };
export type VoiceStatus = { connected: boolean; provider: VoiceProvider | null; model: string | null; connected_at: string | null };
export type VoiceConnectInput = { provider: VoiceProvider; model: string; apiKey: string };
export const voiceOff: VoiceStatus = { connected: false, provider: null, model: null, connected_at: null };

export type IntegrationsOverview = {
  whoop: { configured: boolean; connected: boolean; last_synced_at: string | null; last_sync_error: string | null };
  seerr: SeerrStatus;
  ai: AiStatus;
  // Missing from servers older than "more than one AI".
  ais?: AiChoices;
  chatgpt: ChatgptStatus;
  // Missing from servers older than the voice model.
  voice?: VoiceStatus;
};

// The AIs as the overview lists them; an older server's single AI is turned into the same shape.
export function aiChoicesOf(overview: IntegrationsOverview): AiChoices {
  if (overview.ais) return overview.ais;
  if (overview.chatgpt.status === "connected") return { choices: [{ provider: "chatgpt", model: null, instructions: null, connected_at: null, is_default: true }], default: "chatgpt", server_key: false };
  if (overview.ai.connected && overview.ai.provider) {
    const { provider, model, instructions, connected_at } = overview.ai;
    return { choices: [{ provider, model, instructions, connected_at, is_default: true }], default: provider, server_key: false };
  }
  return { choices: [], default: null, server_key: overview.ai.configured };
}

// "?ai=gemini" for a request that should use a picked AI; nothing for the default.
export const aiQuery = (choice: AiChoiceName | null | undefined) => (choice ? `?ai=${choice}` : "");

// The picked AI if it is still connected, else the default.
export function pickedAi(choices: AiChoices, picked: AiChoiceName | null): AiChoiceName | null {
  return picked && choices.choices.some((choice) => choice.provider === picked) ? picked : choices.default;
}

// The display name of the AI a request would go to, or null when none would answer. A server key is Claude's.
export function aiName(choices: AiChoices, picked: AiChoiceName | null = null): string | null {
  const chosen = pickedAi(choices, picked);
  if (chosen) return AI_CHOICE_NAMES[chosen];
  return choices.server_key ? "Claude" : null;
}

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
  disconnectOneAi: (api: Api, provider: AiProvider) => api.delete(`/integrations/ai/${provider}`),
  setAiDefault: (api: Api, provider: AiChoiceName) => api.put<AiChoices>("/integrations/ai/default", { provider }),
  chatgpt: (api: ChatgptApi) => api.get<ChatgptStatus>("/integrations/chatgpt"),
  startChatgpt: (api: ChatgptApi) => api.post<ChatgptStart>("/integrations/chatgpt/start"),
  finishChatgpt: (api: ChatgptApi, callbackUrl: string) => api.post<ChatgptStatus>("/integrations/chatgpt/finish", { callback_url: callbackUrl.trim() }),
  disconnectChatgpt: (api: ChatgptApi) => api.delete("/integrations/chatgpt"),
  voice: (api: Api) => api.get<VoiceStatus>("/integrations/voice"),
  connectVoice: (api: Api, { provider, model, apiKey }: VoiceConnectInput) =>
    // No api_key means "keep the saved one" (same provider only).
    api.put<VoiceStatus>("/integrations/voice", { provider, model: model.trim() || null, ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}) }),
  disconnectVoice: (api: Api) => api.delete("/integrations/voice"),
  transcribe: (api: Pick<ApiClient, "post">, audio: string, mediaType: string, language: "ar" | "en") =>
    api.post<{ text: string }>("/integrations/voice/transcribe", { audio, media_type: mediaType, language })
};

// A saved key only stands in for its own provider; the model can be left empty.
export const voiceFormReady = (form: Pick<VoiceConnectInput, "provider" | "apiKey">, savedProvider: VoiceProvider | null) =>
  Boolean(form.apiKey.trim()) || form.provider === savedProvider;

export function voiceState(voice: VoiceStatus | undefined): IntegrationState {
  if (voice?.connected && voice.provider) return { label: t.voiceOn, tone: "success", detail: `${VOICE_PROVIDER_NAMES[voice.provider]} · ${voice.model}` };
  return { label: t.voiceOff, tone: "neutral", detail: t.voiceOffDetail };
}

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
