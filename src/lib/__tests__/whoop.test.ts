import { describe, expect, it, vi } from "vitest";
import { connectResultMessage, describeChange, formatHours, recentRecovery, recoveryTone, syncedAgo, whoopApi, zoneFor, type WhoopDay, type WhoopMetric } from "@/lib/whoop";

function metric(overrides: Partial<WhoopMetric>): WhoopMetric {
  return { key: "recovery", average: 60, last7: 66, prev7: 60, change: 6, higher_is_better: true, ...overrides };
}

function day(date: string, recovery: number | null): WhoopDay {
  return { date, recovery, recovery_zone: zoneFor(recovery) } as WhoopDay;
}

describe("whoop", () => {
  it("uses WHOOP's recovery bands", () => {
    expect([67, 66.9, 34, 33.9, null].map(zoneFor)).toEqual(["green", "yellow", "yellow", "red", null]);
    expect(recoveryTone("green")).toBe("success");
    expect(recoveryTone("red")).toBe("danger");
    expect(recoveryTone(null)).toBe("neutral");
  });

  it("colours a change by whether it moved the good way", () => {
    expect(describeChange(metric({}))).toEqual({ text: "+6% vs prior week", tone: "success" });
    expect(describeChange(metric({ change: -6 }))).toEqual({ text: "-6% vs prior week", tone: "danger" });
    // Resting heart rate going up is the bad direction.
    expect(describeChange(metric({ key: "resting_hr", change: 3, higher_is_better: false }))).toEqual({ text: "+3 bpm vs prior week", tone: "danger" });
    // Strain is context, not good or bad.
    expect(describeChange(metric({ key: "strain", change: 1.24, higher_is_better: null }))).toEqual({ text: "+1.2 vs prior week", tone: "neutral" });
    expect(describeChange(metric({ key: "sleep_hours", change: -0.5 }))).toEqual({ text: "-30m vs prior week", tone: "danger" });
    expect(describeChange(metric({ change: 0.4 }))).toEqual({ text: "steady vs prior week", tone: "neutral" });
    expect(describeChange(metric({ prev7: null, change: null }))).toBeNull();
  });

  it("formats hours and sync time", () => {
    expect(formatHours(7.25)).toBe("7h 15m");
    expect(formatHours(6.999)).toBe("7h 00m");
    expect(formatHours(null)).toBe("-");
    const now = new Date("2026-10-29T12:00:00Z");
    expect(syncedAgo(null, now)).toBe("Not synced yet");
    expect(syncedAgo("2026-10-29T11:59:50Z", now)).toBe("Synced just now");
    expect(syncedAgo("2026-10-29T11:20:00Z", now)).toBe("Synced 40m ago");
    expect(syncedAgo("2026-10-29T09:00:00Z", now)).toBe("Synced 3h ago");
    expect(syncedAgo("2026-10-25T12:00:00Z", now)).toBe("Synced 4d ago");
  });

  it("keeps the last 14 days for the bars, gaps included", () => {
    const daily = Array.from({ length: 20 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, i % 5 === 0 ? null : 30 + i * 3));
    const bars = recentRecovery(daily);
    expect(bars).toHaveLength(14);
    expect(bars[0].date).toBe("2026-10-07");
    expect(bars.find((bar) => bar.date === "2026-10-11")?.value).toBeNull();
    expect(bars.at(-1)).toEqual({ date: "2026-10-20", value: 87, zone: "green" });
  });

  it("reads the server's redirect back into the app", () => {
    expect(connectResultMessage("orbit://whoop?status=connected")).toEqual({ ok: true, message: "WHOOP connected. Your data is syncing." });
    expect(connectResultMessage("exp://192.168.1.5:8081/--/whoop?status=denied")?.ok).toBe(false);
    expect(connectResultMessage("orbit://whoop?status=bad_setup")).toEqual({ ok: false, message: "WHOOP refused Orbit's app settings. Check the scopes and keys of the WHOOP app." });
    expect(connectResultMessage("orbit://whoop?status=surprise")?.message).toBe("WHOOP sign-in didn't finish.");
    expect(connectResultMessage("orbit://whoop")).toBeNull();
    expect(connectResultMessage(null)).toBeNull();
  });

  it("calls the server's WHOOP routes", async () => {
    const api = { get: vi.fn(async () => null), post: vi.fn(async () => ({ url: "https://example.com" })), delete: vi.fn(async () => null) };
    await whoopApi.connectUrl(api as never, "orbit://whoop");
    expect(api.post).toHaveBeenCalledWith("/whoop/connect", { return_to: "orbit://whoop" });
    await whoopApi.summary(api as never);
    expect(api.get).toHaveBeenCalledWith("/whoop/summary?days=30");
    await whoopApi.disconnect(api as never, true);
    expect(api.delete).toHaveBeenCalledWith("/whoop/connection?delete_data=true");
  });
});
