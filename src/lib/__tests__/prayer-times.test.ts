import { describe, expect, it } from "vitest";
import { nextPrayer, prayerTimesFor, RIYADH, upcomingPrayers } from "@/lib/prayer-times";

const hhmm = (date: Date) => date.toTimeString().slice(0, 5); // test zone is pinned to Riyadh

describe("prayer times", () => {
  it("matches Umm al-Qura times for Riyadh", () => {
    const times = prayerTimesFor(RIYADH, new Date(2026, 9, 27));
    expect(times.map((prayer) => [prayer.name, hhmm(prayer.at)])).toEqual([
      ["fajr", "04:38"],
      ["dhuhr", "11:37"],
      ["asr", "14:51"],
      ["maghrib", "17:17"],
      ["isha", "18:47"]
    ]);
  });

  it("rolls over to tomorrow's fajr after isha", () => {
    const next = nextPrayer(RIYADH, new Date(2026, 9, 27, 21, 0));
    expect(next.name).toBe("fajr");
    expect(next.at.getDate()).toBe(28);
  });

  it("lists the next ten prayers in order", () => {
    const list = upcomingPrayers(RIYADH, new Date(2026, 9, 27, 13, 0), 2);
    expect(list).toHaveLength(10);
    expect(list[0].name).toBe("asr");
    expect(list.every((prayer, index) => index === 0 || prayer.at > list[index - 1].at)).toBe(true);
  });
});
