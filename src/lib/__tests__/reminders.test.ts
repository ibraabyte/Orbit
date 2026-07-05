import { describe, expect, it } from "vitest";
import { postponeReminderAt, SNOOZE_PRESETS, snoozePresetLabel, snoozeReminderAt } from "@/lib/reminders";

describe("reminder snooze helpers", () => {
  it("snoozes relative presets from the current time", () => {
    const now = new Date(2026, 6, 1, 10, 30, 0, 0);

    expect(snoozeReminderAt("15m", now)).toBe(new Date(2026, 6, 1, 10, 45, 0, 0).toISOString());
    expect(snoozeReminderAt("1h", now)).toBe(new Date(2026, 6, 1, 11, 30, 0, 0).toISOString());
  });

  it("snoozes tomorrow to local morning", () => {
    expect(snoozeReminderAt("tomorrow", new Date(2026, 6, 1, 23, 45, 0, 0))).toBe(
      new Date(2026, 6, 2, 9, 0, 0, 0).toISOString()
    );
  });

  it("postpones due reminders from now", () => {
    const now = new Date(2026, 6, 1, 10, 30, 0, 0);

    expect(postponeReminderAt("1h", new Date(2026, 6, 1, 8, 0, 0, 0).toISOString(), now)).toBe(
      new Date(2026, 6, 1, 11, 30, 0, 0).toISOString()
    );
  });

  it("postpones future reminders from their scheduled time", () => {
    const now = new Date(2026, 6, 1, 10, 30, 0, 0);

    expect(postponeReminderAt("15m", new Date(2026, 6, 1, 15, 0, 0, 0).toISOString(), now)).toBe(
      new Date(2026, 6, 1, 15, 15, 0, 0).toISOString()
    );
  });

  it("falls back to now when the existing reminder time is invalid", () => {
    const now = new Date(2026, 6, 1, 10, 30, 0, 0);

    expect(postponeReminderAt("15m", "not-a-date", now)).toBe(new Date(2026, 6, 1, 10, 45, 0, 0).toISOString());
  });

  it("labels snooze presets compactly", () => {
    expect(SNOOZE_PRESETS).toEqual(["15m", "1h", "tomorrow"]);
    expect(snoozePresetLabel("15m")).toBe("15m");
    expect(snoozePresetLabel("1h")).toBe("1h");
    expect(snoozePresetLabel("tomorrow")).toBe("Tomorrow");
  });
});
