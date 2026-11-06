import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, EmptyState, type } from "@/components/drift";
import { FactRows, Poster, PosterGrid } from "@/components/seerr-parts";
import { Screen } from "@/components/screen";
import { useSeerr } from "@/hooks/use-seerr";
import { formatDate, t } from "@/lib/i18n";
import { mt, type SeerrCredit, type SeerrPerson } from "@/lib/seerr";

// An actor or director, like their page in Seerr: photo, short facts, biography, and everything they're in.
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personId = Number(id);
  const seerr = useSeerr();
  const [person, setPerson] = useState<SeerrPerson | null>(null);
  const [credits, setCredits] = useState<SeerrCredit[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [fullBio, setFullBio] = useState(false);

  useEffect(() => {
    const client = seerr.client;
    if (!client || !personId) return;
    void client.person(personId).then(setPerson).catch((error: Error) => setFailed(error.message));
    void client.personCredits(personId).then(setCredits).catch(() => setCredits([]));
  }, [seerr.client, personId]);

  if (!person) {
    return (
      <Screen title={mt.cast}>
        <EmptyState>{failed ?? `${t.loading}…`}</EmptyState>
      </Screen>
    );
  }

  const day = (value: string) => formatDate(value, { day: "numeric", month: "long", year: "numeric" });
  const facts: [string, string][] = [
    person.knownForDepartment ? [mt.knownFor, person.knownForDepartment] : null,
    person.birthday ? [mt.born, [day(person.birthday), person.placeOfBirth].filter(Boolean).join(" · ")] : null,
    person.deathday ? [mt.died, day(person.deathday)] : null
  ].filter(Boolean) as [string, string][];
  const longBio = (person.biography ?? "").length > 360;

  return (
    <Screen title={person.name}>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <Poster path={person.profilePath} title={person.name} width={96} round />
        <View style={{ flex: 1 }}>
          <FactRows rows={facts} />
        </View>
      </View>
      {person.biography ? (
        <Card title={mt.biography}>
          <Text style={type.body} numberOfLines={fullBio || !longBio ? undefined : 6}>
            {person.biography}
          </Text>
          {longBio ? (
            <Pressable onPress={() => setFullBio(!fullBio)} accessibilityRole="button" hitSlop={8}>
              <Text style={type.link}>{fullBio ? mt.less : mt.more}</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
      {credits.length ? (
        <Card title={mt.knownFor}>
          <PosterGrid items={credits} />
        </Card>
      ) : null}
    </Screen>
  );
}
