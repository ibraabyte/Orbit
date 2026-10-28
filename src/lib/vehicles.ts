import type { Vehicle } from "@/lib/types";

export type VehicleDueKind = "registration" | "insurance" | "inspection" | "oil";
export type VehicleDue = { vehicle: Vehicle; kind: VehicleDueKind; label: string; date: string; daysLeft: number };

const dueFields: [VehicleDueKind, keyof Vehicle, string][] = [
  ["registration", "registration_expires_at", "Istimara renewal"],
  ["insurance", "insurance_expires_at", "Insurance renewal"],
  ["inspection", "inspection_expires_at", "Inspection (فحص)"],
  ["oil", "next_oil_change_at", "Oil change"]
];

function localDay(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`);
}

function daysBetween(from: Date, to: Date) {
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  return Math.round((to.getTime() - start.getTime()) / 86_400_000);
}

// Every dated item across all cars, soonest first (overdue ones have negative daysLeft).
export function vehicleDues(vehicles: Vehicle[], now = new Date()): VehicleDue[] {
  return vehicles
    .flatMap((vehicle) =>
      dueFields.flatMap(([kind, field, label]) => {
        const date = vehicle[field];
        return typeof date === "string" ? [{ vehicle, kind, label, date, daysLeft: daysBetween(now, localDay(date)) }] : [];
      })
    )
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function vehicleDuesWithin(vehicles: Vehicle[], days = 30, now = new Date()) {
  return vehicleDues(vehicles, now).filter((due) => due.daysLeft <= days);
}

export function oilChangeDueByDistance(vehicle: Vehicle, marginKm = 500) {
  return vehicle.odometer_km !== null && vehicle.next_oil_change_km !== null && vehicle.odometer_km >= vehicle.next_oil_change_km - marginKm;
}

// Phone alarms at 9:00, 14 days before each renewal and on the day itself.
export function vehicleAlerts(vehicles: Vehicle[], now = new Date()) {
  return vehicleDues(vehicles, now)
    .flatMap((due) =>
      [14, 0].map((before) => {
        const at = localDay(due.date);
        at.setDate(at.getDate() - before);
        at.setHours(9, 0, 0, 0);
        return {
          id: `vehicle-${due.vehicle.id}-${due.kind}-${before}`,
          title: before ? `${due.label} in ${before} days` : `${due.label} is due today`,
          body: `${due.vehicle.name}${due.vehicle.plate ? ` (${due.vehicle.plate})` : ""} · ${due.date}`,
          at,
          url: "/vehicles"
        };
      })
    )
    .filter((alert) => alert.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
