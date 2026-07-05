import { describe, expect, it } from "vitest";
import { addRecurrenceDate, nextRecurrenceDate, nextRecurringTask } from "@/lib/recurrence";
import type { Task } from "@/lib/types";

const baseTask: Task = {
  id: "task-1",
  user_id: "user-1",
  title: "Stretch",
  notes: null,
  status: "open",
  priority: "normal",
  due_at: "2026-07-01T08:00:00.000Z",
  reminder_at: "2026-07-01T07:45:00.000Z",
  reminder_sent_at: null,
  recurrence: "weekly",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z"
};

describe("recurrence", () => {
  it("adds daily, weekly, and monthly recurrence dates", () => {
    expect(addRecurrenceDate("2026-07-01T08:00:00.000Z", "daily")).toBe("2026-07-02T08:00:00.000Z");
    expect(addRecurrenceDate("2026-07-01T08:00:00.000Z", "weekly")).toBe("2026-07-08T08:00:00.000Z");
    expect(addRecurrenceDate("2026-07-01T08:00:00.000Z", "monthly")).toBe("2026-08-01T08:00:00.000Z");
    expect(addRecurrenceDate("2026-01-31T08:00:00.000Z", "monthly")).toBe("2026-02-28T08:00:00.000Z");
    expect(addRecurrenceDate("2026-07-01T08:00:00.000Z", "weekly", 3)).toBe("2026-07-22T08:00:00.000Z");
  });

  it("advances recurrence dates until the next occurrence is in the future", () => {
    expect(nextRecurrenceDate("2026-07-01T08:00:00.000Z", "weekly", new Date("2026-07-15T12:00:00.000Z"))).toEqual({
      value: "2026-07-22T08:00:00.000Z",
      intervals: 3
    });
    expect(nextRecurrenceDate("2026-01-31T08:00:00.000Z", "monthly", new Date("2026-02-01T12:00:00.000Z"))).toEqual({
      value: "2026-02-28T08:00:00.000Z",
      intervals: 1
    });
  });

  it("creates the next task occurrence with matching reminder offset", () => {
    expect(nextRecurringTask(baseTask, new Date("2026-07-01T00:00:00.000Z"))).toMatchObject({
      user_id: "user-1",
      title: "Stretch",
      due_at: "2026-07-08T08:00:00.000Z",
      reminder_at: "2026-07-08T07:45:00.000Z",
      recurrence: "weekly",
      status: "open"
    });
  });

  it("skips missed task occurrences when the completed task is overdue", () => {
    expect(nextRecurringTask(baseTask, new Date("2026-07-15T12:00:00.000Z"))).toMatchObject({
      due_at: "2026-07-22T08:00:00.000Z",
      reminder_at: "2026-07-22T07:45:00.000Z",
      reminder_sent_at: null,
      status: "open"
    });
  });

  it("can create the next task occurrence from a reminder-only anchor", () => {
    expect(
      nextRecurringTask(
        { ...baseTask, due_at: null, reminder_at: "2026-07-01T07:45:00.000Z" },
        new Date("2026-07-15T12:00:00.000Z")
      )
    ).toMatchObject({
      due_at: null,
      reminder_at: "2026-07-22T07:45:00.000Z",
      reminder_sent_at: null
    });
  });

  it("does not create an occurrence without recurrence or date anchors", () => {
    const after = new Date("2026-07-01T00:00:00.000Z");
    expect(nextRecurringTask({ ...baseTask, recurrence: null }, after)).toBeNull();
    expect(nextRecurringTask({ ...baseTask, due_at: null, reminder_at: null }, after)).toBeNull();
  });
});
