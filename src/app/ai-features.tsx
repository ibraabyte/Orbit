import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { EmptyState } from "@/components/drift";
import { FeatureModelsCard } from "@/components/feature-models-card";
import { Loading, Screen } from "@/components/screen";
import { getApi } from "@/lib/backend";
import { integrationsApi, type IntegrationsOverview } from "@/lib/integrations";

// Integrations > "What each feature uses": for each AI feature, which of the connected companies and models it uses.
export default function AiFeatures() {
  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await integrationsApi.overview(getApi()));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  // Coming back from a company's page should show what it added.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <Screen refreshing={loading} onRefresh={load}>
      {overview ? (
        <FeatureModelsCard overview={overview} onSaved={(features) => setOverview((current) => (current ? { ...current, features } : current))} />
      ) : loading ? (
        <Loading />
      ) : (
        <EmptyState>{error ?? undefined}</EmptyState>
      )}
    </Screen>
  );
}
