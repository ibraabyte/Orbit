import { describe, expect, it } from "vitest";
import { choiceLabel, featureAi, featureSummary, featuresApi, featuresOf, isFoodLine, removeBody, speechOnPhone, usedBy, type FeatureStatus } from "@/lib/feature-models";
import type { IntegrationsOverview } from "@/lib/integrations";

const row = (feature: FeatureStatus["feature"], extra: Partial<FeatureStatus> = {}): FeatureStatus => ({
  feature,
  kind: feature === "speech" ? "speech" : feature === "call" || feature === "phone_agent" ? "realtime" : "ai",
  choice: null,
  effective: "openai",
  default: "openai",
  options: ["openai", "gemini"],
  stale: false,
  ...extra
});

const overview = (features?: FeatureStatus[]): IntegrationsOverview => ({
  whoop: { configured: false, connected: false, last_synced_at: null, last_sync_error: null },
  seerr: { connected: false, url: null, account_name: null, connected_at: null },
  ai: { configured: true, connected: true, provider: "openai", model: "made-up-gpt", instructions: null, connected_at: null },
  ais: {
    choices: [
      { provider: "openai", model: "made-up-gpt", instructions: null, connected_at: null, is_default: true },
      { provider: "gemini", model: "made-up-gemini", instructions: null, connected_at: null, is_default: false }
    ],
    default: "openai",
    server_key: false
  },
  chatgpt: { status: "not_connected" },
  voice: { connected: true, provider: "groq", model: "whisper-large-v3", connected_at: null },
  features
});

describe("what each feature uses", () => {
  it("keeps the app's order and is empty for an older server", () => {
    expect(featuresOf(overview())).toEqual([]);
    expect(featuresOf(null)).toEqual([]);
    expect(featuresOf(overview([row("call"), row("assistant")])).map((item) => item.feature)).toEqual(["assistant", "call"]);
  });

  it("uses the feature's AI only while it is connected", () => {
    const set = overview([row("food_text", { choice: "gemini", effective: "gemini" }), row("assistant")]);
    expect(featureAi(set, "food_text")).toBe("gemini");
    expect(featureAi(set, "assistant")).toBe("openai");
    // Not listed (older server) or nothing connected: the server decides.
    expect(featureAi(set, "week")).toBeNull();
    expect(featureAi(overview([row("health", { effective: null, options: [] })]), "health")).toBeNull();
  });

  it("keeps speech on the phone only when the phone is picked", () => {
    expect(speechOnPhone(overview([row("speech", { effective: "cloud", options: ["phone", "cloud"] })]))).toBe(false);
    expect(speechOnPhone(overview([row("speech", { choice: "phone", effective: "phone", options: ["phone", "cloud"] })]))).toBe(true);
    expect(speechOnPhone(overview())).toBe(false);
  });

  it("knows a line that logs food", () => {
    for (const line of ["أكلت شاورما", "اكلت تمر وقهوة", "تغديت كبسة", "شربت لبن", "ate two eggs", "I ate a banana", "I had a burger"]) expect(isFoodLine(line)).toBe(true);
    for (const line of ["ذكرني أكلم أحمد", "اشتري حليب", "I have a meeting", "spent 40 on lunch", "أكلتها"]) expect(isFoodLine(line)).toBe(false);
  });

  it("reads choices with their model", () => {
    const set = overview();
    expect(choiceLabel(row("assistant"), "gemini", set)).toBe("Gemini · made-up-gemini");
    expect(choiceLabel(row("call"), "gpt-realtime-mini", set)).toBe("gpt-realtime-mini · cheaper");
    expect(choiceLabel(row("speech"), "phone", set)).toBe("The phone");
    expect(choiceLabel(row("speech"), "cloud", set)).toBe("Voice model: Groq · whisper-large-v3");
  });

  it("says the default, the pick, a removed pick, or what is missing", () => {
    const set = overview();
    expect(featureSummary(row("assistant"), set)).toBe("Default: OpenAI · made-up-gpt");
    expect(featureSummary(row("assistant", { choice: "gemini", effective: "gemini" }), set)).toBe("Gemini · made-up-gemini");
    expect(featureSummary(row("assistant", { choice: "anthropic", stale: true }), set)).toBe("Claude was removed, so it uses the default for now: OpenAI · made-up-gpt.");
    expect(featureSummary(row("health", { effective: null, default: null, options: [] }), set)).toBe("Connect an AI above first.");
    expect(featureSummary(row("call", { effective: null, default: null, options: [] }), set)).toBe("Needs an OpenAI key, under AI or Voice model.");
  });

  it("names the features a removed AI was set for", () => {
    const features = [row("assistant", { choice: "gemini" }), row("food_photo", { choice: "gemini" }), row("week"), row("saver", { choice: "gemini", stale: true })];
    expect(usedBy(features, "gemini")).toEqual(["Assistant", "Plate photo"]);
    expect(usedBy(features, "openai")).toEqual([]);
    expect(removeBody("Orbit forgets this key.", [])).toBe("Orbit forgets this key.");
    expect(removeBody("Orbit forgets this key.", ["Assistant", "Plate photo"])).toBe("Orbit forgets this key.\n\nThese go back to the default: Assistant, Plate photo.");
  });

  it("saves one feature, or null for the default", async () => {
    const calls: unknown[] = [];
    const api = { put: async (path: string, body: unknown) => (calls.push([path, body]), []) } as never;
    await featuresApi.set(api, "food_text", "gemini");
    await featuresApi.set(api, "call", null);
    expect(calls).toEqual([
      ["/integrations/features/food_text", { choice: "gemini" }],
      ["/integrations/features/call", { choice: null }]
    ]);
  });
});
