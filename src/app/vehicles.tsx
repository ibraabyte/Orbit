import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { BodyIcon, CarLogo, CarPicker } from "@/components/car-picker";
import { Badge, Card, EmptyState, Hero, Icon, ListRow, ProgressBar, RowButton, type } from "@/components/drift";
import { toDateKey, useOverlays } from "@/components/overlays";
import { Button, Screen } from "@/components/screen";
import { colors, radius, space, textSize } from "@/components/theme";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useVehicles } from "@/hooks/use-vehicles";
import { carMakeOf, parseKm } from "@/lib/car-catalog";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { BODY_TYPES, type Vehicle } from "@/lib/types";

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
  const { vehicles, available, refresh, add, update, remove } = useVehicles(userId);
  const { pickDate, sheet, toast } = useOverlays();
  const [picking, setPicking] = useState(false);
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
        const km = parseKm(value);
        if (km) void run(() => update(vehicle.id, { odometer_km: km }));
      },
      "plain-text",
      vehicle.odometer_km ? String(vehicle.odometer_km) : "",
      "number-pad"
    );

  const pickShape = (vehicle: Vehicle) =>
    sheet({ title: t.carShape, options: BODY_TYPES.map((body) => ({ label: t.bodyTypes[body], run: () => void run(() => update(vehicle.id, { body_type: body })) })) });

  const confirmDelete = (vehicle: Vehicle) =>
    Alert.alert(t.deleteCar, `${vehicle.name}\n${t.deleteCarDetail}`, [
      { text: t.cancel, style: "cancel" },
      { text: t.delete, style: "destructive", onPress: () => void run(() => remove(vehicle.id), t.deleted) }
    ]);

  const showOptions = (vehicle: Vehicle) =>
    sheet({
      title: vehicle.name,
      options: [
        { label: t.odometer, run: () => editOdometer(vehicle) },
        { label: t.carShape, run: () => pickShape(vehicle) },
        { label: t.deleteCar, destructive: true, run: () => confirmDelete(vehicle) }
      ]
    });

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
          <View key={vehicle.id} style={{ gap: space.lg }}>
            <Pressable onPress={() => showOptions(vehicle)} accessibilityRole="button" accessibilityLabel={`${vehicle.name}, ${t.carOptions}`}>
              <Hero style={{ gap: space.lg }}>
                <CarLogo make={carMakeOf(vehicle.name)} />
                <View style={{ flex: 1, gap: space.xs, alignItems: "flex-start" }}>
                  <Text style={[type.h2, { color: colors.heroInk }]}>{vehicle.name}</Text>
                  <View style={styles.shape}>
                    <BodyIcon body={vehicle.body_type} size={18} color={colors.accentMuted} />
                    <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{vehicle.body_type ? t.bodyTypes[vehicle.body_type] : t.carShape}</Text>
                    <Icon name="more-horizontal" size={14} color={colors.accentMuted} />
                  </View>
                  {vehicle.plate ? <Text style={styles.plate}>{vehicle.plate}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.tileLabel, { color: colors.accentMuted }]}>{t.odometer}</Text>
                  <Text style={[type.title, { fontSize: textSize.callout, color: colors.heroInk }]}>{odometer === null ? "–" : `${formatNumber(odometer)} ${t.km}`}</Text>
                </View>
              </Hero>
            </Pressable>
            <Card>
              {fields.map(([field, label, months], index) => {
                const date = vehicle[field];
                const left = date ? daysLeft(date) : null;
                return (
                  <ListRow
                    key={field}
                    first={index === 0}
                    title={label}
                    badges={left === null ? <Badge glyph="○">{t.notSet}</Badge> : left < 0 ? <Badge tone="urgent" glyph="!">{`${-left} ${t.daysOverdue}`}</Badge> : left <= 30 ? <Badge tone="accent" glyph="◷">{`${left} ${t.daysLeft}`}</Badge> : <Badge tone="success" glyph="✓">{`${left} ${t.daysLeft}`}</Badge>}
                    subtitle={date ? formatDate(`${date}T12:00:00`, { day: "numeric", month: "short", year: "numeric" }) : null}
                    trailing={
                      <View style={{ flexDirection: "row", gap: space.sm }}>
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
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                  <Text style={type.barLabel}>
                    {t.oilAt} {formatNumber(oilAt)} {t.km}
                  </Text>
                  <Text style={type.rowSubtitle}>
                    {formatNumber(Math.max(0, oilAt - odometer!))} {t.km}
                  </Text>
                </View>
                <ProgressBar value={oilShare} height={8} />
              </Card>
            ) : null}
          </View>
        );
      })}
      <Button title={t.addCar} onPress={() => setPicking(true)} />
      {picking ? (
        <CarPicker
          onClose={() => setPicking(false)}
          onAdd={(car) =>
            run(async () => {
              await add({ ...car, registration_expires_at: null, insurance_expires_at: null, inspection_expires_at: null, next_oil_change_at: null, next_oil_change_km: null, notes: null });
              setPicking(false);
            })
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  shape: { flexDirection: "row", alignItems: "center", gap: space.xs },
  plate: { ...type.barValue, backgroundColor: colors.shell, color: colors.onShell, borderRadius: radius.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs, letterSpacing: 2, overflow: "hidden" }
});
