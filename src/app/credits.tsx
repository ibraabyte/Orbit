import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Card, EmptyState, ListRow } from "@/components/drift";
import { openPerson, Poster } from "@/components/seerr-parts";
import { Screen } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { t } from "@/lib/i18n";
import { mt, seerrName, type SeerrDetails, type SeerrMediaType } from "@/lib/seerr";

// Everyone in a movie or series, like Seerr's full cast and crew pages: the cast in billing order, then the crew.
export default function Credits() {
  const params = useLocalSearchParams<{ kind: SeerrMediaType; id: string }>();
  const kind: SeerrMediaType = params.kind === "tv" ? "tv" : "movie";
  const tmdbId = Number(params.id);
  const seerr = useSeerr();
  const [item, setItem] = useState<SeerrDetails | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!seerr.client || !tmdbId) return;
    void seerr.client.details(kind, tmdbId).then(setItem, (error: Error) => setFailed(error.message));
  }, [seerr.client, kind, tmdbId]);

  if (!item) {
    return (
      <Screen title={mt.fullCredits}>
        <EmptyState>{failed ?? `${t.loading}…`}</EmptyState>
      </Screen>
    );
  }
  const cast = [...(item.credits?.cast ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // One person can have several crew jobs: one row each, with every job listed.
  const crew = new Map<number, { id: number; name: string; profilePath?: string | null; jobs: string[] }>();
  for (const member of item.credits?.crew ?? []) {
    const row = crew.get(member.id) ?? { id: member.id, name: member.name, profilePath: member.profilePath, jobs: [] };
    if (member.job && !row.jobs.includes(member.job)) row.jobs.push(member.job);
    crew.set(member.id, row);
  }
  return (
    <Screen title={seerrName(item)}>
      {cast.length ? (
        <Card title={mt.cast}>
          {cast.map((person) => (
            <ListRow key={`cast-${person.id}-${person.character}`} leading={<Poster path={person.profilePath} title={person.name} width={36} round />} title={person.name} subtitle={person.character} onPress={() => openPerson(person.id)} />
          ))}
        </Card>
      ) : null}
      {crew.size ? (
        <Card title={mt.crew}>
          {[...crew.values()].map((person) => (
            <ListRow key={`crew-${person.id}`} leading={<Poster path={person.profilePath} title={person.name} width={36} round />} title={person.name} subtitle={person.jobs.join(mt.sep)} onPress={() => openPerson(person.id)} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
