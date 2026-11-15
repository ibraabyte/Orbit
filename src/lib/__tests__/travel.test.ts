import { describe, expect, it } from "vitest";
import { addDays, clockOf, dayShift, defaultDates, flightTitle, formatMinutes, matchAirports, nightsBetween, placeName, searchProblem, stopsText, tripBody, type Airport, type Flight, type TripSearch } from "@/lib/travel";

// Made-up flights and hotels only.
const airports: Airport[] = [
  { code: "RUH", city: "Riyadh", city_ar: "الرياض", country: "SA" },
  { code: "JED", city: "Jeddah", city_ar: "جدة", country: "SA" },
  { code: "DXB", city: "Dubai", city_ar: "دبي", country: "AE" },
  { code: "LHR", city: "London Heathrow", city_ar: "لندن هيثرو", country: "GB" },
  { code: "LGW", city: "London Gatwick", city_ar: "لندن غاتويك", country: "GB" }
];

const search: TripSearch = { origin: "ruh", destination: "DXB", depart_on: "2026-12-05", return_on: "2026-12-10", adults: 2, cabin: "economy", stops: "any", place: "" };

const flight: Flight = {
  price: 980,
  minutes: 185,
  stops: 1,
  airline: "Sample Wings",
  airline_logo: null,
  legs: [
    { airline: "Sample Wings", flight_number: "SW 7", from_code: "RUH", from_name: null, departs: "2026-12-05T22:00:00", to_code: "BAH", to_name: null, arrives: "2026-12-05T23:05:00", minutes: 65 },
    { airline: "Sample Wings", flight_number: "SW 9", from_code: "BAH", from_name: null, departs: "2026-12-05T23:55:00", to_code: "DXB", to_name: null, arrives: "2026-12-06T02:05:00", minutes: 70 }
  ],
  layovers: ["BAH"],
  best: false,
  departs: "2026-12-05T22:00:00",
  arrives: "2026-12-06T02:05:00"
};

describe("airports", () => {
  it("finds by code, by English or Arabic name", () => {
    expect(matchAirports(airports, "dxb").map((a) => a.code)).toEqual(["DXB"]);
    expect(matchAirports(airports, "lon").map((a) => a.code)).toEqual(["LGW", "LHR"]);
    expect(matchAirports(airports, "جد").map((a) => a.code)).toEqual(["JED"]);
    expect(matchAirports(airports, "")).toEqual([]);
  });

  it("names a place after its city, or the code when unknown", () => {
    expect(placeName(airports, "dxb")).toBe("Dubai");
    expect(placeName(airports, "zzz")).toBe("ZZZ");
  });
});

describe("days", () => {
  it("adds days across months and counts nights", () => {
    expect(addDays("2026-12-29", 5)).toBe("2027-01-03");
    expect(nightsBetween("2026-12-05", "2026-12-10")).toBe(5);
    expect(nightsBetween("2026-12-05", null)).toBe(0);
    expect(defaultDates("2026-11-15")).toEqual({ depart_on: "2026-11-29", return_on: "2026-12-04" });
  });

  it("says what is wrong with a search before it uses one", () => {
    const today = "2026-11-15";
    expect(searchProblem(search, today)).toBeNull();
    expect(searchProblem({ ...search, destination: "" }, today)).toBe("Pick both airports.");
    expect(searchProblem({ ...search, destination: "RUH" }, today)).toBe("Pick two different airports.");
    expect(searchProblem({ ...search, depart_on: "2026-11-01" }, today)).toBe("The day out has passed.");
    expect(searchProblem({ ...search, return_on: "2026-12-05" }, today)).toBe("The day back must be after the day out.");
    expect(searchProblem({ ...search, return_on: null }, today)).toBeNull();
  });
});

describe("flights", () => {
  it("reads local times as written and marks a next-day arrival", () => {
    expect(clockOf(flight.departs)).toBe("22:00");
    expect(clockOf(null)).toBeNull();
    expect(dayShift(flight)).toBe(1);
    expect(flightTitle(flight)).toBe("22:00 → 02:05 +1");
    expect(flightTitle({ ...flight, arrives: null })).toBe("22:00");
  });

  it("writes durations and stops", () => {
    expect(formatMinutes(185)).toBe("3h 5m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(null)).toBe("");
    expect(stopsText(flight)).toBe("1 stop (BAH)");
    expect(stopsText({ ...flight, stops: 0 })).toBe("Nonstop");
  });
});

describe("trip body", () => {
  it("carries the picks and only https links", () => {
    const body = tripBody(search, "Dubai", flight, { name: "Made-up Hotel", kind: "hotel", stars: 4, rating: 4.2, reviews: 10, per_night: 450, total: 2250, link: "http://example.com", image: null, amenities: [], check_in_time: null, check_out_time: null, latitude: null, longitude: null }, "https://www.google.com/travel/flights?x=1", "SAR");
    expect(body.origin).toBe("RUH");
    expect(body.flight).toMatchObject({ flight_numbers: ["SW 7", "SW 9"], from_code: "RUH", to_code: "DXB", departs: "2026-12-05T22:00:00", price: 980, stops: 1 });
    expect(body.hotel).toEqual({ name: "Made-up Hotel", per_night: 450, total: 2250, link: null });
    expect(body.flights_url).toBe("https://www.google.com/travel/flights?x=1");
    expect(tripBody(search, "Dubai", null, null, "javascript:x", "SAR")).toMatchObject({ flight: null, hotel: null, flights_url: null });
  });
});
