import type { ApiClient } from "@/lib/api";
import { featuresOf, type FeatureStatus } from "@/lib/feature-models";
import { isArabic, t } from "@/lib/i18n";
import { aiChoicesOf, type IntegrationsOverview } from "@/lib/integrations";

// The AI companies on the Integrations screen, one card each. Inside a company the user saves their key, tests it and
// picks a model from the list the company itself sends (backend/app/routers/ai_providers.py).
// Where keys are kept doesn't change: text AIs in /integrations/ai (one per company), the speech model in
// /integrations/voice (one at a time). The OpenAI key is shared: saved once, it works for both.

export const PROVIDER_IDS = ["openai", "anthropic", "gemini", "openrouter", "groq", "elevenlabs"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type Role = "text" | "speech" | "call";
export type ModelKind = "text" | "speech" | "realtime";
export type ProviderModel = { id: string; name: string | null; kind: ModelKind };

export type Provider = {
  id: ProviderId;
  name: string;
  // A simple letter mark on the company's colour. Not their logo.
  mark: string;
  color: string;
  ink: string;
  roles: Role[];
  // Where the user makes a key.
  keyUrl: string;
  // Signing in with an account instead of a key.
  account?: "chatgpt" | "openrouter";
};

export const PROVIDERS: Record<ProviderId, Provider> = {
  openai: { id: "openai", name: "OpenAI", mark: "O", color: "#10A37F", ink: "#FFFFFF", roles: ["text", "speech", "call"], keyUrl: "https://platform.openai.com/api-keys", account: "chatgpt" },
  anthropic: { id: "anthropic", name: "Claude", mark: "C", color: "#D97757", ink: "#FFFFFF", roles: ["text"], keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { id: "gemini", name: "Gemini", mark: "G", color: "#4285F4", ink: "#FFFFFF", roles: ["text"], keyUrl: "https://aistudio.google.com/apikey" },
  openrouter: { id: "openrouter", name: "OpenRouter", mark: "OR", color: "#6467F2", ink: "#FFFFFF", roles: ["text"], keyUrl: "https://openrouter.ai/settings/keys", account: "openrouter" },
  groq: { id: "groq", name: "Groq", mark: "gq", color: "#F55036", ink: "#FFFFFF", roles: ["speech"], keyUrl: "https://console.groq.com/keys" },
  elevenlabs: { id: "elevenlabs", name: "ElevenLabs", mark: "11", color: "#F2F2F2", ink: "#0A0A0B", roles: ["speech", "call"], keyUrl: "https://elevenlabs.io/app/settings/api-keys" }
};

export const isProviderId = (value: unknown): value is ProviderId => typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);

export type ProviderState = {
  connected: boolean;
  // Saved as a text AI (its model), else null.
  textModel: string | null;
  instructions: string | null;
  // The ChatGPT account (OpenAI only).
  account: boolean;
  // The speech-to-text model when this company is the voice model, else null.
  speechModel: string | null;
  // Some key of this company is saved (the account doesn't count).
  keySaved: boolean;
  isDefault: boolean;
  // Features that use this company right now.
  usedBy: FeatureStatus["feature"][];
};

// What one company does for this person now, from the Integrations overview.
export function providerState(overview: IntegrationsOverview, id: ProviderId): ProviderState {
  const ais = aiChoicesOf(overview);
  const text = ais.choices.find((choice) => choice.provider === id) ?? null;
  const account = id === "openai" && overview.chatgpt.status === "connected";
  const voice = overview.voice?.connected && overview.voice.provider === id ? overview.voice : null;
  const own = (choice: string | null) => choice === id || (account && choice === "chatgpt");
  const usedBy = featuresOf(overview)
    .filter((row) => {
      if (!row.effective) return false;
      if (row.kind === "ai") return own(row.effective);
      if (row.kind === "speech") return row.effective === "cloud" && voice !== null;
      // The realtime models are OpenAI's; "elevenlabs" is the ElevenLabs call.
      return row.effective === "elevenlabs" ? id === "elevenlabs" : id === "openai";
    })
    .map((row) => row.feature);
  return {
    connected: Boolean(text || account || voice),
    textModel: text?.model ?? null,
    instructions: text?.instructions ?? null,
    account,
    speechModel: voice?.model ?? null,
    keySaved: Boolean(text || voice),
    isDefault: own(ais.default),
    usedBy
  };
}

// The model a company's card names: its text model, the ChatGPT account, or its speech model.
export const providerModel = (state: ProviderState): string | null => state.textModel ?? (state.account ? t.pv.methodChatgpt : null) ?? state.speechModel;

// A company's state in one line (for screen readers).
export function providerSummary(provider: Provider, state: ProviderState): string {
  if (!state.connected) return t.pv.notConnected;
  const model = providerModel(state);
  return [state.isDefault ? t.pv.isDefault : t.pv.connected, ...(model ? [model] : [])].join(" · ");
}

export const roleLabel = (role: Role) => ({ text: t.pv.roleText, speech: t.pv.roleSpeech, call: t.pv.roleCall })[role];
export const rolesLine = (provider: Provider) => provider.roles.map(roleLabel).join(isArabic ? "، " : ", ");

// A company's models of one kind matching what was typed, the first `limit` of them, and how many more there are.
export function filterModels(models: ProviderModel[], kind: ModelKind, query: string, limit = 30): { shown: ProviderModel[]; more: number } {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = models.filter((model) => model.kind === kind && words.every((word) => `${model.id} ${model.name ?? ""}`.toLowerCase().includes(word)));
  return { shown: found.slice(0, limit), more: Math.max(0, found.length - limit) };
}

// The model to start with after a key test: the saved one, else the company's newest of that kind.
export function firstModel(models: ProviderModel[], kind: ModelKind, saved: string | null): string | null {
  if (saved) return saved;
  return models.find((model) => model.kind === kind)?.id ?? null;
}

// What an OpenRouter sign-in left in the address the browser came back to.
export function openrouterResult(url: string): { ok: boolean; message: string } | null {
  const status = /[?&]status=([a-z_]+)/.exec(url)?.[1];
  if (!status) return null;
  if (status === "connected") return { ok: true, message: t.pv.openrouterDone };
  if (status === "denied") return { ok: false, message: t.pv.openrouterDenied };
  if (status === "expired") return { ok: false, message: t.pv.openrouterExpired };
  return { ok: false, message: t.pv.openrouterError };
}

export const providersApi = {
  // With a key: tests it before anything is saved. Without: uses the saved one.
  models: (api: Pick<ApiClient, "post">, id: ProviderId, apiKey?: string) =>
    api.post<{ models: ProviderModel[] }>(`/integrations/providers/${id}/models`, apiKey?.trim() ? { api_key: apiKey.trim() } : {}),
  startOpenrouter: (api: Pick<ApiClient, "post">, returnTo: string) => api.post<{ authorization_url: string }>("/integrations/openrouter/start", { return_to: returnTo })
};
