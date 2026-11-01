import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, Card, EmptyState, Hero, IconTile, ListRow, ProgressBar, RowButton, type } from "@/components/drift";
import { toDateKey, useOverlays } from "@/components/overlays";
import { Button, Input, Screen } from "@/components/screen";
import { colors, radius } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useVehicles } from "@/hooks/use-vehicles";
import { formatDate, t } from "@/lib/i18n";
import type { Vehicle } from "@/lib/types";

type DateField = "registration_expires_at" | "insurance_expires_at" | "inspection_expires_at" | "next_oil_change_at";

// Renewing is one tap: the next date is set from today with the usual Saudi interval.
const fields: [DateField, string, number][] = [
  ["registration_expires_at", t.registration, 12],
  ["insurance_expires_at", t.insurance, 12],
  ["inspection_expires_at", t.inspection, 12],
  ["next_oil_change_at", t.oilChange, 6]
];
const oilIntervalKm = 5000;

function monthsFromToday(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return toDateKey(date);
}

function daysLeft(date: string) {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000);
}

export default function Vehicles() {
  const { userId } = useDashboardData();
  const { vehicles, available, refresh, add, update } = useVehicles(userId);
  const { pickDate, toast } = useOverlays();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async (work: () => Promise<void>, message = t.saved) => {
    try {
      await work();
      toast(message);
    } catch (error) {
      Alert.alert(t.couldNotAdd, error instanceof Error ? error.message : t.tryAgain);
    }
  };

  const reload = async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  };

  const renew = (vehicle: Vehicle, field: DateField, months: number) =>
    run(
      () =>
        update(vehicle.id, {
          [field]: monthsFromToday(months),
          ...(field === "next_oil_change_at" && vehicle.odometer_km !== null ? { next_oil_change_km: vehicle.odometer_km + oilIntervalKm } : {})
        }),
      t.renewedToday
    );

  const enterDate = async (vehicle: Vehicle, field: DateField, label: string) => {
    const date = await pickDate(label, vehicle[field]);
    if (date) void run(() => update(vehicle.id, { [field]: date }));
  };

  // ponytail: Alert.prompt is iOS-only; Android users set the odometer elsewhere.
  const editOdometer = (vehicle: Vehicle) =>
    Alert.prompt(
      t.odometer,
      undefined,
      (value) => {
        const km = Number(value.replace(/[^\d]/g, ""));
        if (km) void run(() => update(vehicle.id, { odometer_km: km }));
      },
      "plain-text",
      vehicle.odometer_km ? String(vehicle.odometer_km) : "",
      "number-pad"
    );

  if (!available) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <EmptyState>{t.error}</EmptyState>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {vehicles.map((vehicle) => {
        const { odometer_km: odometer, next_oil_change_km: oilAt } = vehicle;
        const oilShare = odometer !== null && oilAt ? ((odometer - (oilAt - oilIntervalKm)) / oilIntervalKm) * 100 : null;
        return (
          <View key={vehicle.id} style={{ gap: 14 }}>
            <Pressable onPress={() => editOdometer(vehicle)} accessibilityRole="button" accessibilityLabel={t.odometer}>
              <Hero style={{ gap: 14 }}>
                <IconTile name="truck" size={44} tone="urgent" />
                <View style={{ flex: 1, gap: 4, alignItems: "flex-start" }}>
                  <Text style={[type.h2, { color: colors.accentInk }]}>{vehicle.name}</Text>
                  {vehicle.plate ? <Text style={styles.plate}>{vehicle.plate}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{t.odometer}</Text>
                  <Text style={[type.title, { fontSize: 16, color: colors.accentInk }]}>{odometer === null ? "–" : `${odometer.toLocaleString()} ${t.km}`}</Text>
                </View>
              </Hero>
            </Pressable>
            <Card>
              {fields.map(([field, label, months]) => {
                const date = vehicle[field];
                const left = date ? daysLeft(date) : null;
                return (
                  <ListRow
                    key={field}
                    title={label}
                    badges={left === null ? <Badge glyph="○">{t.notSet}</Badge> : left < 0 ? <Badge tone="urgent" glyph="!">{`${-left} ${t.daysOverdue}`}</Badge> : left <= 30 ? <Badge tone="accent" glyph="◷">{`${left} ${t.daysLeft}`}</Badge> : <Badge tone="success" glyph="✓">{`${left} ${t.daysLeft}`}</Badge>}
                    subtitle={date ? formatDate(`${date}T12:00:00`, { day: "numeric", month: "short", year: "numeric" }) : null}
                    trailing={
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <RowButton label={t.renewedToday} onPress={() => renew(vehicle, field, months)} />
                        <RowButton outline icon="calendar" label={t.enterDate} onPress={() => enterDate(vehicle, field, label)} />
                      </View>
                    }
                  />
                );
              })}
            </Card>
            {oilAt && oilShare !== null ? (
              <Card>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={type.barLabel}>
                    {t.oilAt} {oilAt.toLocaleString()} {t.km}
                  </Text>
                  <Text style={type.rowSubtitle}>
                    {Math.max(0, oilAt - odometer!).toLocaleString()} {t.km}
                  </Text>
                </View>
                <ProgressBar value={oilShare} height={8} />
              </Card>
            ) : null}
          </View>
        );
      })}
      <View style={styles.add}>
        <Input style={{ flex: 1 }} placeholder={t.addCar} value={name} onChangeText={setName} returnKeyType="done" />
        <Button
          title={t.add}
          disabled={!name.trim()}
          onPress={() =>
            run(async () => {
              await add({ name: name.trim(), plate: null, odometer_km: null, registration_expires_at: null, insurance_expires_at: null, inspection_expires_at: null, next_oil_change_at: null, next_oil_change_km: null, notes: null });
              setName("");
            })
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plate: { ...type.barValue, backgroundColor: colors.shell, color: colors.onShell, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, letterSpacing: 2, overflow: "hidden" },
  add: { flexDirection: "row", gap: 8, alignItems: "center", borderRadius: radius.card }
});
