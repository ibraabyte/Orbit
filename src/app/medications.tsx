import { router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, Icon, IconTile, ListRow, RingGauge, type } from "@/components/drift";
import { DoseRow } from "@/components/medication-ui";
import { GroupHeader, Screen } from "@/components/screen";
import { colors, fonts, space, textSize } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useNow } from "@/hooks/use-now";
import { courseOver, daysToEnd, doseLog, dosesOnDay, isLow, logDayLabel, rx, scheduleText, stockText } from "@/lib/medications";
import { digits, formatClock24, formatDate, isArabic } from "@/lib/i18n";
import type { Medication } from "@/lib/types";

const edit = (medication?: Medication) => router.push(medication ? { pathname: "/medication-edit", params: { id: medication.id } } : "/medication-edit");

// Medications: how today is going, today's doses to tick off, the medicines with what's left, and the last week as dots.
export default function Medications() {
  const { data, loading, refresh } = useDashboardData();
  const now = useNow();
  const medications = data.medications;
  const today = useMemo(() => dosesOnDay(medications, data.medicationDoses, now, now), [medications, data.medicationDoses, now]);
  const log = useMemo(() => doseLog(medications, data.medicationDoses, now), [medications, data.medicationDoses, now]);
  const taken = today.filter((entry) => entry.state === "taken").length;
  const next = today.find((entry) => !entry.dose && entry.state !== "missed");
  const missedDays = log.filter((day) => day.missed.length);

  const badgeFor = (medication: Medication) => {
    if (courseOver(medication, now)) return <Badge glyph="✓">{rx.ended}</Badge>;
    if (medication.paused) return <Badge glyph="‖">{rx.pausedBadge}</Badge>;
    if (isLow(medication)) return <Badge tone="urgent" glyph="!">{rx.low}</Badge>;
    return undefined;
  };

  return (
    <Screen refreshing={loading} onRefresh={() => void refresh()} stackAction={{ label: rx.add, onPress: () => edit() }}>
      {today.length ? (
        <Card style={styles.summary}>
          <RingGauge value={taken / today.length} size={64} thickness={7} label={`${taken}/${today.length}`} />
          <View style={{ flex: 1, gap: space.xxs }}>
            <Text style={type.h2}>{rx.todayDoses}</Text>
            <Text style={type.rowSubtitle}>{[rx.logLine(taken, today.length), next ? `${rx.states.upcoming} ${formatClock24(next.at)}` : null].filter(Boolean).join(" · ")}</Text>
          </View>
        </Card>
      ) : null}

      <View>
        <GroupHeader label={rx.todayDoses} />
        <Card list={today.length > 0}>
          {today.length ? today.map((entry, index) => <DoseRow key={entry.key} entry={entry} first={index === 0} />) : <EmptyState icon="check">{medications.length ? rx.noneToday : rx.empty}</EmptyState>}
        </Card>
      </View>

      <View>
        <GroupHeader label={rx.myMedications} />
        <Card list={medications.length > 0}>
          {medications.length ? (
            medications.map((medication, index) => {
              const end = daysToEnd(medication, now);
              const details = [medication.dose, scheduleText(medication), stockText(medication), end !== null && end >= 0 ? rx.endsIn(end) : null].filter(Boolean).join(" · ");
              return <ListRow key={medication.id} first={index === 0} leading={<IconTile name={medication.paused ? "pause" : "plus-square"} size={36} tone={isLow(medication) ? "urgent" : "neutral"} />} title={medication.name} badges={badgeFor(medication)} subtitle={details} onPress={() => edit(medication)} chevron />;
            })
          ) : (
            <EmptyState icon="plus-square" example={rx.emptyExample} action={{ label: rx.add, onPress: () => edit() }} />
          )}
        </Card>
      </View>

      <View>
        <GroupHeader label={rx.log} />
        <Card>
          {log.length ? (
            <>
              <View style={styles.week}>
                {[...log].reverse().map((day) => {
                  const all = day.taken === day.due;
                  const missed = day.missed.length > 0;
                  const label = logDayLabel(day.day, now);
                  return (
                    <View key={day.day} style={styles.day} accessible accessibilityLabel={`${label}: ${rx.logLine(day.taken, day.due)}`}>
                      <View style={[styles.dot, all && styles.dotDone, missed && styles.dotMissed]}>
                        {all ? <Icon name="check" size={13} color={colors.urgentInk} /> : <Text style={styles.dotText}>{missed ? "!" : digits(`${day.taken}/${day.due}`)}</Text>}
                      </View>
                      <Text style={type.axis} numberOfLines={1}>
                        {formatDate(`${day.day}T12:00:00`, { weekday: "short" })}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {missedDays.map((day) => (
                <Text key={day.day} style={type.rowSubtitle}>
                  {`${logDayLabel(day.day, now)}: ${rx.missedNames([...new Set(day.missed.map((entry) => entry.medication.name))].join(isArabic ? "، " : ", "))}`}
                </Text>
              ))}
            </>
          ) : (
            <Text style={type.rowSubtitle}>{rx.logEmpty}</Text>
          )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: space.lg },
  week: { flexDirection: "row", justifyContent: "space-between", gap: space.xs, paddingVertical: space.xs },
  day: { flex: 1, alignItems: "center", gap: space.xs },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  dotMissed: { borderColor: colors.ink },
  dotText: { fontFamily: fonts.bold, fontSize: textSize.caption2, color: colors.ink }
});
