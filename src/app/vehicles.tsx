import { useState } from "react";
import { Alert, View } from "react-native";
import { Button, Empty, Input, Row, Screen, Section } from "@/components/screen";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useVehicles } from "@/hooks/use-vehicles";
import { oilChangeDueByDistance } from "@/lib/vehicles";
import type { Vehicle } from "@/lib/types";

type DateField = "registration_expires_at" | "insurance_expires_at" | "inspection_expires_at" | "next_oil_change_at";

// Renewing is one tap: the next date is set from today with the usual Saudi interval.
const fields: [DateField, string, number][] = [
  ["registration_expires_at", "Istimara", 12],
  ["insurance_expires_at", "Insurance", 12],
  ["inspection_expires_at", "Inspection (فحص)", 12],
  ["next_oil_change_at", "Oil change", 6]
];
const oilIntervalKm = 5000;

function monthsFromToday(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysLeft(date: string) {
  return Math.round((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000);
}

export default function Vehicles() {
  const { userId } = useDashboardData();
  const { vehicles, available, refresh, add, update } = useVehicles(userId);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const run = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      Alert.alert("Could not save", error instanceof Error ? error.message : "Try again.");
    }
  };

  const reload = async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  };

  // ponytail: Alert.prompt is iOS-only; Android users get the one-tap renew only.
  const editDate = (vehicle: Vehicle, field: DateField, label: string, months: number) =>
    Alert.alert(label, vehicle[field] ? `Due ${vehicle[field]}` : "Not set yet", [
      {
        text: `Renewed today (next in ${months} months)`,
        onPress: () =>
          run(() =>
            update(vehicle.id, {
              [field]: monthsFromToday(months),
              ...(field === "next_oil_change_at" && vehicle.odometer_km !== null ? { next_oil_change_km: vehicle.odometer_km + oilIntervalKm } : {})
            })
          )
      },
      {
        text: "Type a date",
        onPress: () =>
          Alert.prompt(label, "YYYY-MM-DD", (value) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return Alert.alert("Use YYYY-MM-DD", "For example 2027-03-15.");
            void run(() => update(vehicle.id, { [field]: value.trim() }));
          }, "plain-text", vehicle[field] ?? monthsFromToday(months))
      },
      { text: "Cancel", style: "cancel" }
    ]);

  const editOdometer = (vehicle: Vehicle) =>
    Alert.prompt("Odometer (km)", undefined, (value) => {
      const km = Number(value.replace(/[^\d]/g, ""));
      if (km) void run(() => update(vehicle.id, { odometer_km: km }));
    }, "plain-text", vehicle.odometer_km ? String(vehicle.odometer_km) : "", "number-pad");

  if (!available) {
    return (
      <Screen refreshing={loading} onRefresh={reload}>
        <Empty>Your cars could not be loaded. Check your connection, then pull to refresh.</Empty>
      </Screen>
    );
  }

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {vehicles.map((vehicle) => (
        <Section key={vehicle.id} title={vehicle.plate ? `${vehicle.name} · ${vehicle.plate}` : vehicle.name}>
          {fields.map(([field, label, months]) => {
            const date = vehicle[field];
            const left = date ? daysLeft(date) : null;
            return (
              <Row
                key={field}
                title={label}
                detail={date ? `${date} · ${left! < 0 ? `${-left!} days overdue` : `${left} days left`}` : "Tap to set"}
                tone={left === null ? undefined : left < 0 ? "danger" : left <= 30 ? "warning" : "success"}
                onPress={() => editDate(vehicle, field, label, months)}
              />
            );
          })}
          <Row
            title="Odometer"
            detail={vehicle.next_oil_change_km ? `Oil at ${vehicle.next_oil_change_km.toLocaleString()} km` : null}
            tone={oilChangeDueByDistance(vehicle) ? "warning" : undefined}
            right={vehicle.odometer_km ? `${vehicle.odometer_km.toLocaleString()} km` : "Set"}
            onPress={() => editOdometer(vehicle)}
          />
        </Section>
      ))}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Input style={{ flex: 1 }} placeholder={vehicles.length ? "Add another car" : "Your car, e.g. Camry 2022"} value={name} onChangeText={setName} returnKeyType="done" />
        <Button
          title="Add"
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
