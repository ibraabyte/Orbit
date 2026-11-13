import { router } from "expo-router";
import { useMemo } from "react";
import { Text } from "react-native";
import { Badge, Card, CountBadge, EmptyState, IconTile, ListRow, type } from "@/components/drift";
import { DoseRow } from "@/components/medication-ui";
import { Button, Columns, Screen } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNow } from "@/hooks/use-now";
import { courseOver, daysToEnd, doseLog, dosesOnDay, isLow, logDayLabel, rx, scheduleText, stockText } from "@/lib/medications";
import { isArabic } from "@/lib/i18n";
import type { Medication } from "@/lib/types";

const edit = (medication?: Medication) => router.push(medication ? { pathname: "/medication-edit", params: { id: medication.id } } : "/medication-edit");

// Medications: today's doses to tick off, the medicines with what's left, and the last week's log.
export default function Medications() {
  const { data, loading, refresh } = useDashboardData();
  const now = useNow();
  const medications = data.medications;
  const today = useMemo(() => dosesOnDay(medications, data.medicationDoses, now, now), [medications, data.medicationDoses, now]);
  const log = useMemo(() => doseLog(medications, data.medicationDoses, now), [medications, data.medicationDoses, now]);

  const badgeFor = (medication: Medication) => {
    if (courseOver(medication, now)) return <Badge glyph="✓">{rx.ended}</Badge>;
    if (medication.paused) return <Badge glyph="‖">{rx.pausedBadge}</Badge>;
    if (isLow(medication)) return <Badge tone="urgent" glyph="!">{rx.low}</Badge>;
    return undefined;
  };

  const left = (
    <>
      <Card title={rx.todayDoses} action={today.length ? <CountBadge value={today.filter((entry) => !entry.dose).length} alert={today.some((entry) => entry.state === "missed")} /> : undefined}>
        {today.length ? today.map((entry, index) => <DoseRow key={entry.key} entry={entry} first={index === 0} />) : <EmptyState icon="check">{medications.length ? rx.noneToday : rx.empty}</EmptyState>}
      </Card>
      <Card title={rx.myMedications}>
        {medications.length ? (
          medications.map((medication, index) => {
            const end = daysToEnd(medication, now);
            const details = [medication.dose, scheduleText(medication), stockText(medication), end !== null && end >= 0 ? rx.endsIn(end) : null].filter(Boolean).join(" · ");
            return <ListRow key={medication.id} first={index === 0} leading={<IconTile name="plus-square" tone={isLow(medication) ? "urgent" : "accent"} />} title={medication.name} badges={badgeFor(medication)} subtitle={details} onPress={() => edit(medication)} chevron />;
          })
        ) : (
          <EmptyState icon="plus-square" example={rx.emptyExample} action={{ label: rx.add, onPress: () => edit() }} />
        )}
      </Card>
      {medications.length ? <Button variant="primary" title={rx.add} onPress={() => edit()} /> : null}
    </>
  );

  const right = (
    <Card title={rx.log}>
      {log.length ? (
        log.map((day, index) => (
          <ListRow
            key={day.day}
            first={index === 0}
            title={logDayLabel(day.day, now)}
            badges={day.missed.length ? <Badge tone="urgent" glyph="!">{rx.states.missed}</Badge> : day.taken === day.due ? <Badge tone="success" glyph="✓">{rx.states.taken}</Badge> : undefined}
            subtitle={day.missed.length ? rx.missedNames([...new Set(day.missed.map((entry) => entry.medication.name))].join(isArabic ? "، " : ", ")) : null}
            meta={rx.logLine(day.taken, day.due)}
          />
        ))
      ) : (
        <Text style={type.rowSubtitle}>{rx.logEmpty}</Text>
      )}
    </Card>
  );

  return (
    <Screen wide refreshing={loading} onRefresh={() => void refresh()}>
      <Columns left={left} right={right} />
    </Screen>
  );
}
