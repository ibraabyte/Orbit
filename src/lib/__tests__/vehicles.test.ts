import { describe, expect, it } from "vitest";
import type { Vehicle } from "@/lib/types";
import { oilChangeDueByDistance, vehicleAlerts, vehicleDues, vehicleDuesWithin } from "@/lib/vehicles";

const now = new Date(2026, 9, 27, 10, 0); // Oct 27, 10:00 local

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "camry",
    user_id: "user-1",
    name: "Camry",
    plate: "ABC 1234",
    odometer_km: 80_000,
    registration_expires_at: null,
    insurance_expires_at: null,
    inspection_expires_at: null,
    next_oil_change_at: null,
    next_oil_change_km: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("vehicles", () => {
  const car = vehicle({ registration_expires_at: "2026-11-05", insurance_expires_at: "2027-03-01", next_oil_change_at: "2026-10-20" });

  it("lists dated items soonest first, overdue as negative days", () => {
    expect(vehicleDues([car], now).map((due) => [due.kind, due.daysLeft])).toEqual([
      ["oil", -7],
      ["registration", 9],
      ["insurance", 125]
    ]);
    expect(vehicleDuesWithin([car], 30, now).map((due) => due.kind)).toEqual(["oil", "registration"]);
  });

  it("alerts 14 days before and on the day, only in the future", () => {
    // Registration: the 14-day heads-up (Oct 22) has passed, the same-day one has not.
    const alerts = vehicleAlerts([car], now);
    expect(alerts.map((alert) => alert.id)).toEqual(["vehicle-camry-registration-0", "vehicle-camry-insurance-14", "vehicle-camry-insurance-0"]);
    expect(alerts[0].title).toBe("Istimara renewal is due today");
    expect(alerts[0].at.getHours()).toBe(9);
  });

  it("flags an oil change by distance within 500 km", () => {
    expect(oilChangeDueByDistance(vehicle({ odometer_km: 84_600, next_oil_change_km: 85_000 }))).toBe(true);
    expect(oilChangeDueByDistance(vehicle({ odometer_km: 84_000, next_oil_change_km: 85_000 }))).toBe(false);
    expect(oilChangeDueByDistance(vehicle({ next_oil_change_km: null }))).toBe(false);
  });
});
