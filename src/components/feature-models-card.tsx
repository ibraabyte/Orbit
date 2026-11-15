import { useState, type ReactNode } from "react";
import { CallVoiceRow } from "@/components/call-voice-row";
import { Alert } from "react-native";
import { IconMark, PickRow, ProviderMark, type Pick } from "@/components/ai-provider-parts";
import { Card, type IconName } from "@/components/drift";
import { PROVIDERS, type ProviderId } from "@/lib/ai-providers";
import { getApi } from "@/lib/backend";
import { CALL_ELEVENLABS, featuresApi, featuresOf, type Feature, type FeatureStatus } from "@/lib/feature-models";
import { t } from "@/lib/i18n";
import { AI_CHOICE_NAMES, VOICE_PROVIDER_NAMES, type AiChoiceName, type IntegrationsOverview } from "@/lib/integrations";

const ICONS: Record<Feature, IconName> = {
  assistant: "message-circle",
  food_text: "edit-3",
  food_photo: "camera",
  health: "activity",
  week: "calendar",
  saver: "bookmark",
  speech: "mic",
  call: "phone-call",
  phone_agent: "phone-outgoing"
};

const DEFAULT = "default";

// Advanced: each feature as one row in two groups (writing, voice) showing the logo and name of what it uses; a tap
// opens the default and the connected choices in place.
// ponytail: a feature with nothing connected to use (effective null) is left out, and a removed pick shows what is used
// now; add a "needs a key" hint back if people miss features this way.
export function FeatureModelsCard({ overview, onSaved }: { overview: IntegrationsOverview; onSaved: (features: FeatureStatus[]) => void }) {
  const [saving, setSaving] = useState(false);
  const rows = featuresOf(overview).filter((row) => row.effective !== null);
  if (!rows.length) return null;

  const pick = async (row: FeatureStatus, key: string) => {
    setSaving(true);
    try {
      onSaved(await featuresApi.set(getApi(), row.feature, key === DEFAULT ? null : key));
    } catch (error) {
      Alert.alert(t.featuresTitle, error instanceof Error ? error.message : t.featureSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  // One choice as a pick: its logo and short name.
  const toPick = (row: FeatureStatus, choice: string, key = choice): Pick => {
    const [label, mark] = describe(row, choice, overview);
    return { key, label, mark };
  };
  const picksOf = (row: FeatureStatus): Pick[] => {
    const fallback = row.default ? toPick(row, row.default, DEFAULT) : null;
    const others = row.options.filter((choice) => choice !== row.default || row.choice === choice);
    return [...(fallback ? [{ ...fallback, label: `${t.featureDefaultOption} · ${fallback.label}` }] : []), ...others.map((choice) => toPick(row, choice))];
  };

  const group = (title: string, list: FeatureStatus[], extra?: ReactNode) =>
    list.length ? (
      <Card title={title}>
        {list.map((row) => {
          const picks = picksOf(row);
          const value = row.choice && !row.stale ? row.choice : DEFAULT;
          // The closed row shows what is used now, by its plain name.
          return <PickRow key={row.feature} icon={ICONS[row.feature]} title={t.featureNames[row.feature]} picks={picks} value={value} summary={toPick(row, row.effective!, value)} disabled={saving} onPick={(key) => void pick(row, key)} />;
        })}
        {extra}
      </Card>
    ) : null;

  return (
    <>
      {group(t.pv.basicText, rows.filter((row) => row.kind === "ai"))}
      {group(t.pv.basicVoice, rows.filter((row) => row.kind !== "ai"), <CallVoiceRow />)}
    </>
  );
}

// A choice's short name and logo: an AI company, a realtime model (OpenAI's) or ElevenLabs, the phone or the voice model.
function describe(row: FeatureStatus, choice: string, overview: IntegrationsOverview): [string, Pick["mark"]] {
  const mark = (id: ProviderId) => <ProviderMark provider={PROVIDERS[id]} size={24} />;
  if (row.kind === "ai") return [AI_CHOICE_NAMES[choice as AiChoiceName] ?? choice, mark(choice === "chatgpt" ? "openai" : (choice as ProviderId))];
  if (row.kind === "realtime") return choice === CALL_ELEVENLABS ? ["ElevenLabs", mark("elevenlabs")] : [choice, mark("openai")];
  if (choice === "phone") return [t.featurePhone, <IconMark name="smartphone" size={24} />];
  const voice = overview.voice?.provider ?? null;
  return voice ? [VOICE_PROVIDER_NAMES[voice], mark(voice)] : [choice, <IconMark name="mic" size={24} />];
}
