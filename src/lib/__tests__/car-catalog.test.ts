import { describe, expect, it } from "vitest";
import { carMakes, carModels, carName, carYears, filterChoices, parseKm } from "@/lib/car-catalog";

describe("car catalog", () => {
  it("has models for every make, with no repeats", () => {
    for (const make of carMakes) {
      const models = carModels(make);
      expect(models.length).toBeGreaterThan(0);
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it("has no models for a typed make", () => {
    expect(carModels("Some Other Make")).toEqual([]);
  });

  it("finds a choice whatever the case, spaces or dashes", () => {
    expect(filterChoices(carModels("Mazda"), "cx5").matches).toContain("CX-5");
    expect(filterChoices(carModels("Toyota"), "land cruiser").matches).toContain("Land Cruiser");
  });

  it("offers typed text only when no choice is exactly that", () => {
    expect(filterChoices(["Camry", "Camry Hybrid"], " camry ").typed).toBeNull();
    expect(filterChoices(["Camry"], "  Cam ").typed).toBe("Cam");
    expect(filterChoices(["Camry"], "   ").typed).toBeNull();
  });

  it("lists years newest first, from next model year", () => {
    const years = carYears(new Date(2026, 10, 3));
    expect(years[0]).toBe("2027");
    expect(years.at(-1)).toBe("1980");
  });

  it("names a car make, model, year", () => {
    expect(carName(" Toyota ", "Camry", "2024")).toBe("Toyota Camry 2024");
  });

  it("reads kilometres in both digit sets", () => {
    expect(parseKm("80,000")).toBe(80000);
    expect(parseKm("٨٠٠٠٠")).toBe(80000);
    expect(parseKm("")).toBeNull();
  });
});
