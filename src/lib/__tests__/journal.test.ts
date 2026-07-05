import { describe, expect, it } from "vitest";
import { averageMood, journalEntriesInLastDays, moodScore, todayEntry } from "@/lib/journal";
import type { JournalEntry } from "@/lib/types";

const entries: JournalEntry[] = [
  {
    id: "entry-1",
    user_id: "user-1",
    mood: "great",
    title: null,
    body: "Strong day",
    entry_date: "2026-07-01",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z"
  },
  {
    id: "entry-2",
    user_id: "user-1",
    mood: "neutral",
    title: null,
    body: "Okay",
    entry_date: "2026-06-28",
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:00:00.000Z"
  },
  {
    id: "entry-3",
    user_id: "user-1",
    mood: "bad",
    title: null,
    body: "Old",
    entry_date: "2026-06-01",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z"
  }
];

describe("journal", () => {
  it("scores and averages moods", () => {
    expect(moodScore("great")).toBe(5);
    expect(averageMood(entries.slice(0, 2))).toBe("good");
    expect(averageMood([])).toBeNull();
  });

  it("filters recent entries and finds today's entry", () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    expect(journalEntriesInLastDays(entries, 7, now).map((entry) => entry.id)).toEqual(["entry-1", "entry-2"]);
    expect(todayEntry(entries, now)?.id).toBe("entry-1");
  });
});
