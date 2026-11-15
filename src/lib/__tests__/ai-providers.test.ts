import { describe, expect, it } from "vitest";
import { filterModels, firstModel, modelMaker, isProviderId, openrouterResult, PROVIDER_IDS, PROVIDERS, providersApi, providerState, providerSummary, type ProviderModel } from "@/lib/ai-providers";
import type { FeatureStatus } from "@/lib/feature-models";
import type { IntegrationsOverview } from "@/lib/integrations";

const feature = (name: FeatureStatus["feature"], effective: string | null, kind: FeatureStatus["kind"] = "ai"): FeatureStatus => ({
  feature: name,
  kind,
  choice: null,
  effective,
  default: effective,
  options: effective ? [effective] : [],
  stale: false
});

const overview = (extra: Partial<IntegrationsOverview> = {}): IntegrationsOverview => ({
  whoop: { configured: false, connected: false, last_synced_at: null, last_sync_error: null },
  seerr: { connected: false, url: null, account_name: null, connected_at: null },
  ai: { configured: true, connected: true, provider: "anthropic", model: "claude-made-up", instructions: null, connected_at: null },
  ais: {
    choices: [
      { provider: "anthropic", model: "claude-made-up", instructions: "Short answers", connected_at: null, is_default: true },
      { provider: "openai", model: "gpt-made-up", instructions: null, connected_at: null, is_default: false }
    ],
    default: "anthropic",
    server_key: false
  },
  chatgpt: { status: "not_connected" },
  voice: { connected: true, provider: "groq", model: "whisper-large-v3", connected_at: null },
  features: [
    feature("assistant", "anthropic"),
    feature("food_text", "openai"),
    feature("speech", "cloud", "speech"),
    feature("call", "elevenlabs", "realtime"),
    feature("phone_agent", "gpt-realtime", "realtime")
  ],
  ...extra
});

const models: ProviderModel[] = [
  { id: "gpt-new", name: null, kind: "text" },
  { id: "gpt-mini", name: "GPT Mini", kind: "text" },
  { id: "gpt-4o-transcribe", name: null, kind: "speech" }
];

describe("the AI companies", () => {
  it("lists every company once with a name and a key page", () => {
    expect(PROVIDER_IDS).toHaveLength(6);
    for (const id of PROVIDER_IDS) {
      expect(PROVIDERS[id].id).toBe(id);
      expect(PROVIDERS[id].name.length).toBeGreaterThan(0);
      expect(PROVIDERS[id].keyUrl.startsWith("https://")).toBe(true);
    }
    expect(isProviderId("groq")).toBe(true);
    expect(isProviderId("chatgpt")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });

  it("reads what each company does now from the overview", () => {
    const claude = providerState(overview(), "anthropic");
    expect(claude).toMatchObject({ connected: true, textModel: "claude-made-up", instructions: "Short answers", isDefault: true, keySaved: true, usedBy: ["assistant"] });
    expect(providerState(overview(), "openai")).toMatchObject({ connected: true, isDefault: false, speechModel: null, usedBy: ["food_text", "phone_agent"] });
    expect(providerState(overview(), "groq")).toMatchObject({ connected: true, textModel: null, speechModel: "whisper-large-v3", usedBy: ["speech"] });
    expect(providerState(overview(), "elevenlabs")).toMatchObject({ connected: false, keySaved: false, usedBy: ["call"] });
    expect(providerState(overview(), "gemini")).toMatchObject({ connected: false, keySaved: false, usedBy: [] });
  });

  it("counts the ChatGPT account as OpenAI, but not as a saved key", () => {
    const signedIn = overview({
      ais: { choices: [{ provider: "chatgpt", model: null, instructions: null, connected_at: null, is_default: true }], default: "chatgpt", server_key: false },
      chatgpt: { status: "connected" },
      voice: undefined,
      features: [feature("assistant", "chatgpt")]
    });
    expect(providerState(signedIn, "openai")).toMatchObject({ connected: true, account: true, keySaved: false, isDefault: true, usedBy: ["assistant"] });
  });

  it("sums a company up on its card", () => {
    expect(providerSummary(PROVIDERS.anthropic, providerState(overview(), "anthropic"))).toBe("Default · claude-made-up");
    expect(providerSummary(PROVIDERS.groq, providerState(overview(), "groq"))).toBe("Connected · whisper-large-v3");
    expect(providerSummary(PROVIDERS.gemini, providerState(overview(), "gemini"))).toBe("Not connected");
  });

  it("finds models of one kind by any word of their id or name", () => {
    expect(filterModels(models, "text", "").shown.map((m) => m.id)).toEqual(["gpt-new", "gpt-mini"]);
    expect(filterModels(models, "text", "mini").shown.map((m) => m.id)).toEqual(["gpt-mini"]);
    expect(filterModels(models, "text", "GPT  mini").shown.map((m) => m.id)).toEqual(["gpt-mini"]);
    expect(filterModels(models, "speech", "").shown.map((m) => m.id)).toEqual(["gpt-4o-transcribe"]);
    const many = Array.from({ length: 45 }, (_, i): ProviderModel => ({ id: `m-${i}`, name: null, kind: "text" }));
    expect(filterModels(many, "text", "", 30)).toMatchObject({ more: 15 });
  });

  it("starts from the saved model, else the newest", () => {
    expect(firstModel(models, "text", "gpt-mini")).toBe("gpt-mini");
    expect(firstModel(models, "text", null)).toBe("gpt-new");
    expect(firstModel([], "speech", null)).toBeNull();
  });

  it("reads how an OpenRouter sign-in ended", () => {
    expect(openrouterResult("orbit://ai-provider?id=openrouter&status=connected")?.ok).toBe(true);
    expect(openrouterResult("orbit://ai-provider?id=openrouter&status=denied")?.ok).toBe(false);
    expect(openrouterResult("orbit://ai-provider?id=openrouter&status=whatever")?.ok).toBe(false);
    expect(openrouterResult("orbit://ai-provider?id=openrouter")).toBeNull();
  });

  it("sends a typed key only when there is one", async () => {
    const calls: [string, unknown][] = [];
    const api = { post: async <T,>(path: string, body?: unknown) => (calls.push([path, body]), { models: [] } as T) };
    await providersApi.models(api, "groq", "  made-up-key-123 ");
    await providersApi.models(api, "groq");
    expect(calls).toEqual([
      ["/integrations/providers/groq/models", { api_key: "made-up-key-123" }],
      ["/integrations/providers/groq/models", {}]
    ]);
  });
});

describe("a model's mark", () => {
  it("is the company's own, or the maker in an OpenRouter id", () => {
    expect(modelMaker("anthropic", "claude-opus-5-5")).toBe("anthropic");
    expect(modelMaker("openrouter", "anthropic/claude-opus-5-5")).toBe("anthropic");
    expect(modelMaker("openrouter", "google/gemini-3-pro")).toBe("gemini");
    expect(modelMaker("openrouter", "meta-llama/llama-4")).toBe("openrouter");
    expect(modelMaker("openrouter", null)).toBe("openrouter");
  });
});
