import { describe, expect, it } from "vitest";
import { focusMinutesByDay, focusSummary, formatFocusDuration } from "@/lib/focus";
import type { FocusSession } from "@/lib/types";

const now = new Date("2026-07-07T12:00:00.000Z");

function session(overrides: Partial<FocusSession>): FocusSession {
  return {
    id: "focus-1",
    user_id: "user-1",
    task_id: null,
    title: "Deep work",
    duration_minutes: 50,
    started_at: "2026-07-07T09:00:00.000Z",
    ended_at: "2026-07-07T09:50:00.000Z",
    status: "completed",
    energy: 4,
    note: null,
    created_at: "2026-07-07T09:00:00.000Z",
    ...overrides
  };
}

describe("focus sessions", () => {
  it("formats minutes into compact duration labels", () => {
    expect(formatFocusDuration(45)).toBe("45m");
    expect(formatFocusDuration(60)).toBe("1h");
    expect(formatFocusDuration(95)).toBe("1h 35m");
  });

  it("summarizes completed, planned, and overdue focus blocks", () => {
    const focusSessions = [
      session({ id: "today", duration_minutes: 50, energy: 4 }),
      session({
        id: "yesterday",
        duration_minutes: 25,
        started_at: "2026-07-06T10:00:00.000Z",
        ended_at: "2026-07-06T10:25:00.000Z",
        energy: 2
      }),
      session({
        id: "future",
        duration_minutes: 30,
        started_at: "2026-07-08T10:00:00.000Z",
        ended_at: null,
        status: "planned",
        energy: null
      }),
      session({
        id: "overdue",
        duration_minutes: 40,
        started_at: "2026-07-06T08:00:00.000Z",
        ended_at: null,
        status: "planned",
        energy: null
      }),
      session({ id: "cancelled", duration_minutes: 60, status: "cancelled" })
    ];

    expect(focusMinutesByDay({ focusSessions }, 2, now).map((day) => day.value)).toEqual([25, 50]);
    expect(focusSummary({ focusSessions }, now)).toMatchObject({
      todayMinutes: 50,
      weekMinutes: 75,
      sessionsLogged: 2,
      averageEnergy: 3,
      plannedUpcoming: [{ id: "future" }],
      plannedOverdue: [{ id: "overdue" }]
    });
  });

  it("counts a late-night UTC session on the local day it happened", () => {
    // 22:30 UTC on Jul 6 is 01:30 on Jul 7 in Riyadh (the pinned test zone).
    const late = session({ id: "late", started_at: "2026-07-06T22:30:00.000Z", status: "completed", duration_minutes: 30 });
    const days = focusMinutesByDay({ focusSessions: [late] }, 2, now);
    expect(days.map((day) => day.value)).toEqual([0, 30]);
  });
});
