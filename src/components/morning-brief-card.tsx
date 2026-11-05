import { useMemo } from "react";
import { Text, View } from "react-native";
import { Card, CardLink, type } from "@/components/drift";
import { Button } from "@/components/screen";
import { morningLabels, type BriefState } from "@/hooks/use-morning-brief";
import { t } from "@/lib/i18n";
import { morningLines } from "@/lib/morning-brief";
import type { DashboardData } from "@/lib/types";

// The AI's brief when there is one. Without an AI, without the person's agreement to send their day to it, or if it failed, a rule-based summary of the data already on this
// screen, in the app's language (the same lines as the morning alert), so the card is never empty and never blocks Today.
// ponytail: this is not review.ts's morning review, which is English only; the upgrade is translating that file.
export function MorningBriefCard({ state, data, retry }: { state: BriefState; data: DashboardData; retry: () => void }) {
  const review = useMemo(() => {
    if (state.status === "ready" || state.status === "loading") return [];
    const lines = morningLines(data, new Date(), morningLabels);
    return lines.length ? lines : [t.morningClear];
  }, [state.status, data]);

  return (
    <Card title={t.morningBrief} action={state.status === "no-ai" ? <CardLink href="/integrations" label={t.morningBriefConnect} /> : state.status === "consent" ? <CardLink href="/ask" label={t.morningBriefAllow} /> : undefined}>
      {state.status === "loading" ? (
        <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
          {t.morningBriefWriting}
        </Text>
      ) : null}
      {state.status === "ready" ? <Text style={type.body}>{state.text}</Text> : null}
      {state.status === "no-ai" ? <Text style={type.rowSubtitle}>{t.morningBriefNoAi}</Text> : null}
      {state.status === "consent" ? <Text style={type.rowSubtitle}>{t.morningBriefConsent}</Text> : null}
      {state.status === "error" ? (
        <View style={{ gap: 8 }}>
          <Text style={type.rowSubtitle} accessibilityLiveRegion="polite">
            {`${t.morningBriefFailed} ${state.message}`.trim()}
          </Text>
          <Button variant="outline" title={t.morningBriefRetry} onPress={retry} />
        </View>
      ) : null}
      {review.map((line) => (
        <Text key={line} style={type.body}>
          {`• ${line}`}
        </Text>
      ))}
    </Card>
  );
}
