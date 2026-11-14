import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/backend";
import { featureAi, type AiFeature } from "@/lib/feature-models";
import { aiChoicesOf, pickedAi, type AiChoiceName, type AiChoices, type IntegrationsOverview } from "@/lib/integrations";

// The AIs this person connected and the one the next request uses: the AI set for this feature in Integrations
// ("What each feature uses"), else their default. A pick on the screen ("AI for this") lasts for this visit only.
export function useAiChoices(feature: AiFeature) {
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [picked, setPicked] = useState<AiChoiceName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await getApi().get<IntegrationsOverview>("/integrations");
      setOverview(next);
      setError(null);
      return next;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const choices: AiChoices | null = overview ? aiChoicesOf(overview) : null;
  // What a request for this feature (or another, like food by text on the assistant) uses: the screen's pick while it
  // is still connected, else the feature's AI, else the default. null: the server decides.
  const choiceFor = useCallback(
    (which: AiFeature): AiChoiceName | null => (choices ? pickedAi(choices, picked ?? featureAi(overview, which)) : null),
    [choices, overview, picked]
  );
  const current = choiceFor(feature);
  return { overview, choices, current, choiceFor, setPicked, reload, error };
}
