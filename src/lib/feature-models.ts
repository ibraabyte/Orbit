import { isArabic, t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, VOICE_PROVIDER_NAMES, type AiChoiceName, type IntegrationsOverview } from "@/lib/integrations";
import type { ApiClient } from "@/lib/api";

// What each AI feature uses (Integrations > "What each feature uses"). Shapes mirror backend/app/routers/integrations.py
// FeatureStatus and backend/app/services/feature_models.py.
export const FEATURES = ["assistant", "food_text", "food_photo", "health", "week", "saver", "speech", "call", "phone_agent"] as const;
export type Feature = (typeof FEATURES)[number];
export type AiFeature = "assistant" | "food_text" | "food_photo" | "health" | "week" | "saver";
export type FeatureStatus = {
  feature: Feature;
  kind: "ai" | "realtime" | "speech";
  // What was saved; null: the default.
  choice: string | null;
  // What the feature uses now; null: nothing it can use is connected.
  effective: string | null;
  default: string | null;
  options: string[];
  // Saved, but its key was removed: the default is used until it is changed.
  stale: boolean;
};

export const REALTIME_CHEAPER = "gpt-realtime-mini";

export const featuresApi = {
  list: (api: Pick<ApiClient, "get">) => api.get<FeatureStatus[]>("/integrations/features"),
  // null: back to the default.
  set: (api: Pick<ApiClient, "put">, feature: Feature, choice: string | null) => api.put<FeatureStatus[]>(`/integrations/features/${feature}`, { choice })
};

// The features this server knows, in the app's order. Older servers send none.
export const featuresOf = (overview: IntegrationsOverview | null): FeatureStatus[] => {
  const list = overview?.features ?? [];
  return FEATURES.flatMap((feature) => list.filter((row) => row.feature === feature));
};

// The AI one feature uses now, while it is still connected; null leaves it to the server's default.
export function featureAi(overview: IntegrationsOverview | null, feature: AiFeature): AiChoiceName | null {
  const row = featuresOf(overview).find((item) => item.feature === feature);
  return row?.effective && row.options.includes(row.effective) ? (row.effective as AiChoiceName) : null;
}

// The mic goes to the voice model unless the phone was picked (or the voice model was removed).
export function speechOnPhone(overview: IntegrationsOverview | null): boolean {
  const row = featuresOf(overview).find((item) => item.feature === "speech");
  return row?.effective === "phone";
}

// A line that logs food or a drink goes to the AI picked for food by text.
const FOOD_LINE = /^\s*(?:(?:أ|ا|إ)كلت|(?:أ|ا)?فطرت|تريقت|تريّقت|تغديت|تغدّيت|تعشيت|تعشّيت|شربت|(?:i\s+)?(?:ate|drank|had\s+(?:a|an|some|\d)))(?:\s|$)/i;
export const isFoodLine = (line: string) => FOOD_LINE.test(line);

// How a choice reads in a list: an AI, a realtime model, the phone or the voice model.
// short: the AI's name only, for the "Default" option.
export function choiceLabel(row: Pick<FeatureStatus, "kind">, choice: string, overview: IntegrationsOverview | null, short = false): string {
  if (row.kind === "ai") {
    const name = AI_CHOICE_NAMES[choice as AiChoiceName] ?? choice;
    const model = short ? null : overview?.ais?.choices.find((item) => item.provider === choice)?.model;
    return model ? `${name} · ${model}` : name;
  }
  if (row.kind === "realtime") return choice === REALTIME_CHEAPER ? `${choice} · ${t.featureCheaper}` : choice;
  if (choice === "phone") return t.featurePhone;
  const voice = overview?.voice;
  const name = voice?.provider ? `${VOICE_PROVIDER_NAMES[voice.provider]} · ${voice.model ?? ""}`.trim() : "";
  return t.featureCloud.replace("{name}", name);
}

// The line under a feature's name: what it uses now, and whether its pick was removed.
export function featureSummary(row: FeatureStatus, overview: IntegrationsOverview | null): string {
  if (!row.effective) return row.kind === "realtime" ? t.featureNeedsOpenai : t.featureNeedsAi;
  const now = choiceLabel(row, row.effective, overview);
  // Short names here, so the long line doesn't break inside a model name.
  if (row.stale && row.choice) return t.featureStale.replace("{name}", choiceLabel(row, row.choice, overview, true)).replace("{now}", choiceLabel(row, row.effective, overview, true));
  return row.choice ? now : t.featureDefault.replace("{name}", now);
}

// Features set to this AI (or voice model), named for the "remove" warning.
export function usedBy(features: FeatureStatus[], choice: string, kind: FeatureStatus["kind"] = "ai"): string[] {
  return features.filter((row) => row.kind === kind && row.choice === choice && !row.stale).map((row) => t.featureNames[row.feature]);
}

// The remove warning's body, with the features that go back to the default.
export const removeBody = (body: string, names: string[]) => (names.length ? `${body}\n\n${t.aiRemoveUsedBy.replace("{features}", names.join(isArabic ? "، " : ", "))}` : body);
