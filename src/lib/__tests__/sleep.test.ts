import { describe, expect, it } from "vitest";
import { averageSleepMinutes, averageSleepQuality, formatSleepDuration, sleepByDay, sleepLogsInLastDays, sleepSummary } from "@/lib/sleep";
import type { SleepLog } from "@/lib/types";

const now = new Date("2026-07-07T12:00:00.000Z");

function sleepLog(overrides: Partial<SleepLog>): SleepLog {
  return {
    id: "sleep-1",
    user_id: "user-1",
    sleep_date: "2026-07-07",
    duration_minutes: 420,
    quality: 4,
    bedtime_at: null,
    woke_at: null,
    note: null,
    created_at: "2026-07-07T08:00:00.000Z",
    ...overrides
  };
}

describe("sleep", () => {
  it("formats sleep duration compactly", () => {
    expect(formatSleepDuration(0)).toBe("0m");
    expect(formatSleepDuration(45)).toBe("45m");
    expect(formatSleepDuration(420)).toBe("7h");
    expect(formatSleepDuration(455)).toBe("7h 35m");
  });

  it("builds daily sleep metrics and summaries", () => {
    const logs = [
      sleepLog({ id: "sleep-1", duration_minutes: 420, quality: 4 }),
      sleepLog({ id: "sleep-2", sleep_date: "2026-07-06", duration_minutes: 360, quality: 3 }),
      sleepLog({ id: "old", sleep_date: "2026-06-01", duration_minutes: 300, quality: 2 })
    ];

    expect(sleepByDay({ sleepLogs: logs }, 1, now)).toEqual([{ date: "2026-07-07", label: "Tue", value: 420 }]);
    expect(sleepLogsInLastDays(logs, 7, now).map((log) => log.id)).toEqual(["sleep-1", "sleep-2"]);
    expect(averageSleepMinutes(logs.slice(0, 2))).toBe(390);
    expect(averageSleepQuality(logs.slice(0, 2))).toBe(3.5);
    expect(sleepSummary({ sleepLogs: logs }, now)).toMatchObject({
      todayMinutes: 420,
      sevenDayAverageMinutes: 390,
      sevenDayQuality: 3.5,
      nightsLogged: 2
    });
  });
});
