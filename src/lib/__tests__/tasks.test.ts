import { describe, expect, it } from "vitest";
import {
  dayGroup,
  groupByDay,
  inList,
  listNameTaken,
  nextListPosition,
  nextStepPosition,
  onDay,
  parseClock,
  reminderAt,
  reminderLead,
  snoozeChanges,
  snoozeTarget,
  sortLists,
  stepProgress,
  stepsByTask
} from "@/lib/tasks";
import type { Task, TaskList, TaskStep } from "@/lib/types";

// Riyadh time (UTC+3): 2026-07-01 12:00 local.
const now = new Date("2026-07-01T09:00:00.000Z");
const local = (day: number, hour: number, minute = 0) => new Date(2026, 6, day, hour, minute).toISOString();

function task(overrides: Partial<Task>): Task {
  return {
    id: crypto.randomUUID(),
    user_id: "user-1",
    title: "Task",
    notes: null,
    status: "open",
    priority: "normal",
    due_at: null,
    reminder_at: null,
    reminder_sent_at: null,
    recurrence: null,
    list_id: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

const step = (overrides: Partial<TaskStep>): TaskStep => ({
  id: crypto.randomUUID(),
  user_id: "user-1",
  task_id: "t1",
  title: "Step",
  done: false,
  position: 0,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  ...overrides
});

const list = (name: string, position: number, id = name.toLowerCase()): TaskList => ({
  id,
  user_id: "user-1",
  name,
  position,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z"
});

describe("day groups", () => {
  it("puts each task on its day, by local time", () => {
    expect(dayGroup(task({ due_at: local(1, 11) }), now)).toBe("overdue");
    expect(dayGroup(task({ due_at: new Date(2026, 5, 30, 9).toISOString() }), now)).toBe("overdue");
    expect(dayGroup(task({ due_at: local(1, 23, 59) }), now)).toBe("today");
    expect(dayGroup(task({ due_at: local(2, 0, 30) }), now)).toBe("tomorrow");
    expect(dayGroup(task({ due_at: local(3, 9) }), now)).toBe("later");
    expect(dayGroup(task({ due_at: null }), now)).toBe("someday");
  });

  it("groups open tasks in day order, earliest and most urgent first, and drops empty groups", () => {
    const groups = groupByDay(
      [
        task({ title: "later", due_at: local(9, 9) }),
        task({ title: "today low", due_at: local(1, 18), priority: "low" }),
        task({ title: "today high", due_at: local(1, 18), priority: "high" }),
        task({ title: "today early", due_at: local(1, 14) }),
        task({ title: "done", due_at: local(1, 14), status: "done" }),
        task({ title: "someday" })
      ],
      now
    );
    expect(groups.map((group) => [group.group, group.tasks.map((item) => item.title)])).toEqual([
      ["today", ["today early", "today high", "today low"]],
      ["later", ["later"]],
      ["someday", ["someday"]]
    ]);
  });
});

describe("lists", () => {
  const tasks = [task({ title: "home", list_id: "home" }), task({ title: "loose" })];

  it("filters by list, by no list, or not at all", () => {
    expect(inList(tasks, "all")).toHaveLength(2);
    expect(inList(tasks, "none").map((item) => item.title)).toEqual(["loose"]);
    expect(inList(tasks, "home").map((item) => item.title)).toEqual(["home"]);
  });

  it("orders lists and finds the next position and taken names", () => {
    const lists = [list("Work", 2), list("Home", 0), list("Errands", 2)];
    expect(sortLists(lists).map((item) => item.name)).toEqual(["Home", "Errands", "Work"]);
    expect(nextListPosition(lists)).toBe(3);
    expect(nextListPosition([])).toBe(0);
    expect(listNameTaken(lists, " home ")).toBe(true);
    expect(listNameTaken(lists, "Home", "home")).toBe(false);
    expect(listNameTaken(lists, "Gym")).toBe(false);
  });
});

describe("checklists", () => {
  it("keeps each task's steps in order and counts the ticked ones", () => {
    const steps = [step({ title: "b", position: 1, done: true }), step({ title: "a", position: 0 }), step({ task_id: "t2", title: "other" })];
    const byTask = stepsByTask(steps);
    expect(byTask.get("t1")!.map((item) => item.title)).toEqual(["a", "b"]);
    expect(stepProgress(byTask.get("t1"))).toEqual({ done: 1, total: 2 });
    expect(stepProgress(undefined)).toEqual({ done: 0, total: 0 });
    expect(nextStepPosition(byTask.get("t1"))).toBe(2);
    expect(nextStepPosition(undefined)).toBe(0);
  });
});

describe("snooze", () => {
  it("offers an hour, tonight, tomorrow and next week", () => {
    const dated = task({ due_at: local(1, 10, 30) });
    expect(snoozeTarget("hour", dated, now)!.toISOString()).toBe(local(1, 13));
    expect(snoozeTarget("tonight", dated, now)!.toISOString()).toBe(local(1, 20));
    // Keeps the task's time of day.
    expect(snoozeTarget("tomorrow", dated, now)!.toISOString()).toBe(local(2, 10, 30));
    expect(snoozeTarget("nextWeek", dated, now)!.toISOString()).toBe(local(8, 10, 30));
    // No date: 9 in the morning.
    expect(snoozeTarget("tomorrow", task({}), now)!.toISOString()).toBe(local(2, 9));
  });

  it("moves a task that is still ahead from its own day, and skips tonight when it is too late", () => {
    const friday = task({ due_at: local(3, 17) });
    expect(snoozeTarget("tomorrow", friday, now)!.toISOString()).toBe(local(4, 17));
    expect(snoozeTarget("tonight", friday, new Date(local(1, 19, 45)))).toBeNull();
  });

  it("moves the reminder with the due date, keeping its lead", () => {
    const until = new Date(local(2, 9));
    expect(snoozeChanges(task({ due_at: local(1, 10), reminder_at: local(1, 9, 45) }), until)).toEqual({
      due_at: local(2, 9),
      reminder_at: local(2, 8, 45)
    });
    expect(snoozeChanges(task({ reminder_at: local(1, 9) }), until)).toEqual({ due_at: local(2, 9), reminder_at: local(2, 9) });
    expect(snoozeChanges(task({ due_at: local(1, 10) }), until)).toEqual({ due_at: local(2, 9) });
  });
});

describe("reminder lead", () => {
  it("reads the lead from a task and turns a lead back into a time", () => {
    expect(reminderLead(task({}))).toBe("none");
    expect(reminderLead(task({ due_at: local(1, 10), reminder_at: local(1, 9, 45) }))).toBe("15");
    expect(reminderLead(task({ due_at: local(2, 10), reminder_at: local(1, 10) }))).toBe("1440");
    expect(reminderLead(task({ due_at: local(1, 10), reminder_at: local(1, 9, 50) }))).toBe("custom");
    expect(reminderLead(task({ reminder_at: local(1, 9) }))).toBe("custom");

    expect(reminderAt(local(1, 10), "60", null)).toBe(local(1, 9));
    expect(reminderAt(local(1, 10), "0", null)).toBe(local(1, 10));
    expect(reminderAt(local(1, 10), "none", local(1, 9))).toBeNull();
    expect(reminderAt(null, "15", null)).toBeNull();
    expect(reminderAt(local(1, 10), "custom", local(1, 9, 50))).toBe(local(1, 9, 50));
  });
});

describe("times", () => {
  it("reads a clock time, in Western or Arabic digits", () => {
    expect(parseClock("9:30")).toEqual({ hour: 9, minute: 30 });
    expect(parseClock("٢١:٠٥")).toEqual({ hour: 21, minute: 5 });
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("noon")).toBeNull();
  });

  it("moves a task to another day keeping its time", () => {
    expect(onDay(task({ due_at: local(1, 18, 15) }), "2026-07-05").toISOString()).toBe(local(5, 18, 15));
    expect(onDay(task({}), "2026-07-05").toISOString()).toBe(local(5, 9));
  });
});
