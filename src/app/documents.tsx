import { router } from "expo-router";
import { useMemo } from "react";
import { Linking, Text, View } from "react-native";
import { DOCUMENT_ICONS, DocumentBadge, documentSubtitle } from "@/components/document-ui";
import { Badge, Card, CardLink, CountBadge, EmptyState, IconTile, ListRow, RowButton, type } from "@/components/drift";
import { useOverlays } from "@/components/overlays";
import { Button, Columns, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNow } from "@/hooks/use-now";
import { useSections } from "@/hooks/use-sections";
import { getApi } from "@/lib/backend";
import { ABSHER_URL, daysLeft, documentsApi, documentTitle, dx, ON_ABSHER, renewedUntil, RENEW_YEARS, sortedDocuments, stateOf } from "@/lib/documents";
import { formatDate } from "@/lib/i18n";
import type { OfficialDocument } from "@/lib/types";

const edit = (document?: OfficialDocument) => router.push(document ? { pathname: "/document-edit", params: { id: document.id } } : "/document-edit");
const dateText = (key: string) => formatDate(`${key}T12:00:00`, { day: "numeric", month: "short", year: "numeric" });

// Documents: each official paper with how long it has left, soonest first, and one tap to say it was renewed.
export default function Documents() {
  const { data, loading, refresh, act } = useDashboardData();
  const { sheet, toast } = useOverlays();
  const sections = useSections();
  const now = useNow();
  const documents = useMemo(() => sortedDocuments(data.documents), [data.documents]);
  const soon = documents.filter((document) => stateOf(daysLeft(document, now)) !== "ok");
  const rest = documents.filter((document) => !soon.includes(document));

  const save = (document: OfficialDocument, expires_on: string) =>
    void act(() => documentsApi.update(getApi(), document.id, { expires_on })).then((ok) => ok && toast(dx.saved));

  // Renewed: the usual lengths for this kind of paper, from the old expiry (or today, if it has passed).
  const renew = (document: OfficialDocument) =>
    sheet({
      title: dx.renewedTitle,
      detail: documentTitle(document),
      options: [
        ...RENEW_YEARS[document.kind].map((years) => {
          const until = renewedUntil(document, years, now);
          return { label: `${dx.renewedFor(years)} · ${dateText(until)}`, run: () => save(document, until) };
        }),
        { label: dx.otherDate, run: () => edit(document) },
        ...(ON_ABSHER.has(document.kind) ? [{ label: dx.renewOnAbsher, run: () => void Linking.openURL(ABSHER_URL) }] : [])
      ]
    });

  const row = (document: OfficialDocument, index: number) => {
    const left = daysLeft(document, now);
    return (
      <ListRow
        key={document.id}
        first={index === 0}
        leading={<IconTile name={DOCUMENT_ICONS[document.kind]} tone={stateOf(left) === "ok" ? "accent" : "urgent"} />}
        title={documentTitle(document)}
        badges={<DocumentBadge left={left} />}
        subtitle={documentSubtitle(document, left)}
        // A paper due soon carries its own buttons, so the row itself is not one (a button can't sit inside a button).
        onPress={stateOf(left) === "ok" ? () => edit(document) : undefined}
        chevron={stateOf(left) === "ok"}
        trailing={
          stateOf(left) === "ok" ? undefined : (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <RowButton label={dx.renewed} onPress={() => renew(document)} />
              <RowButton outline icon="edit-2" onPress={() => edit(document)} />
            </View>
          )
        }
      />
    );
  };

  const left = (
    <>
      {soon.length ? (
        <Card title={dx.soon} action={<CountBadge value={soon.length} alert={soon.some((document) => daysLeft(document, now) < 0)} />}>
          {soon.map(row)}
        </Card>
      ) : null}
      {!documents.length ? (
        <Card title={dx.documents}>
          <EmptyState icon="file-text" example={dx.emptyExample} action={{ label: dx.add, onPress: () => edit() }}>
            {dx.empty}
          </EmptyState>
        </Card>
      ) : rest.length ? (
        <Card title={dx.documents} action={soon.length ? undefined : <Badge tone="success" glyph="✓">{dx.allGood}</Badge>}>
          {rest.map(row)}
        </Card>
      ) : null}
      {documents.length ? <Button variant="primary" title={dx.add} onPress={() => edit()} /> : null}
    </>
  );

  const right = (
    <Card style={{ gap: 10 }}>
      <Text style={type.rowSubtitle}>{dx.noNumber}</Text>
      {sections.on("vehicles") ? (
        <>
          <Text style={type.rowSubtitle}>{dx.carPapers}</Text>
          <View style={{ alignItems: "flex-start" }}>
            <CardLink href="/vehicles" label={dx.openCar} />
          </View>
        </>
      ) : null}
    </Card>
  );

  return (
    <Screen wide refreshing={loading} onRefresh={() => void refresh()}>
      <Columns left={left} right={right} />
    </Screen>
  );
}
