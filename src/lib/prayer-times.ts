import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";

export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerTime = { name: PrayerName; label: string; at: Date };
export type PrayerPlace = { latitude: number; longitude: number };

export const RIYADH: PrayerPlace = { latitude: 24.7136, longitude: 46.6753 };

const labels: Record<PrayerName, string> = { fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء" };
const order: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

// Umm al-Qura, calculated on the phone: no network needed.
export function prayerTimesFor(place: PrayerPlace, day: Date): PrayerTime[] {
  const times = new PrayerTimes(new Coordinates(place.latitude, place.longitude), day, CalculationMethod.UmmAlQura());
  return order.map((name) => ({ name, label: labels[name], at: times[name] }));
}

// The coming prayers from `now`, across as many days as asked (today first).
export function upcomingPrayers(place: PrayerPlace, now = new Date(), days = 2): PrayerTime[] {
  return Array.from({ length: days + 1 }, (_, offset) => {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    return prayerTimesFor(place, day);
  })
    .flat()
    .filter((prayer) => prayer.at.getTime() > now.getTime())
    .slice(0, days * 5);
}

export function nextPrayer(place: PrayerPlace, now = new Date()) {
  return upcomingPrayers(place, now, 1)[0];
}
