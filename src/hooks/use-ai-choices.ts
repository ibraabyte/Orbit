import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { getApi } from "@/lib/backend";
import { aiChoicesOf, pickedAi, type AiChoiceName, type AiChoices, type IntegrationsOverview } from "@/lib/integrations";

// The AIs this person connected and the one picked for the next request. The pick starts at their default and is
// remembered on this phone per screen (key), so the WHOOP screen can keep Claude while the assistant uses ChatGPT.
export function useAiChoices(key: string) {
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [picked, setPickedState] = useState<AiChoiceName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `orbit.ai-pick.${key}`;

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
    AsyncStorage.getItem(storageKey)
      .then((saved) => setPickedState(saved ? (saved as AiChoiceName) : null))
      .catch(() => undefined);
  }, [reload, storageKey]);

  const setPicked = useCallback(
    (next: AiChoiceName) => {
      setPickedState(next);
      void AsyncStorage.setItem(storageKey, next).catch(() => undefined);
    },
    [storageKey]
  );

  const choices: AiChoices | null = overview ? aiChoicesOf(overview) : null;
  // What the next request uses: the pick while it is still connected, else the default. null: the server decides.
  const current = choices ? pickedAi(choices, picked) : null;
  return { overview, choices, current, setPicked, reload, error };
}
