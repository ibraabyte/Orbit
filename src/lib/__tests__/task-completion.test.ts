import { describe, expect, it } from "vitest";
import { buildTaskCompletionPlan, buildTaskReminderInsert } from "@/lib/task-completion";
import type { Tag, Tagging, Task } from "@/lib/types";

const baseTask: Task = {
  id: "task-1",
  user_id: "user-1",
  title: "Stretch",
  notes: "Mobility",
  status: "open",
  priority: "normal",
  due_at: "2026-07-01T08:00:00.000Z",
  reminder_at: "2026-07-01T07:45:00.000Z",
  reminder_sent_at: null,
  recurrence: "weekly",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z"
};

const tags: Tag[] = [
  { id: "tag-1", user_id: "user-1", name: "health", color: null, created_at: "2026-07-01T00:00:00.000Z" },
  { id: "tag-2", user_id: "user-1", name: "work", color: null, created_at: "2026-07-01T00:00:00.000Z" }
];

const taggings: Tagging[] = [
  { id: "tagging-1", user_id: "user-1", tag_id: "tag-1", target_type: "task", target_id: "task-1", created_at: "2026-07-01T00:00:00.000Z" },
  { id: "tagging-2", user_id: "user-1", tag_id: "tag-2", target_type: "task", target_id: "task-2", created_at: "2026-07-01T00:00:00.000Z" }
];

describe("task completion", () => {
  it("builds a completion plan that cancels old reminders and creates the next recurring task", () => {
    const plan = buildTaskCompletionPlan({
      task: baseTask,
      completedAt: new Date("2026-07-15T12:00:00.000Z"),
      tags,
      taggings
    });

    expect(plan.taskUpdate).toEqual({ status: "done" });
    expect(plan.scheduledReminderUpdate).toEqual({ status: "cancelled" });
    expect(plan.scheduledReminderFilters).toEqual({ taskId: "task-1", userId: "user-1", status: "scheduled" });
    expect(plan.nextTask).toMatchObject({
      user_id: "user-1",
      title: "Stretch",
      due_at: "2026-07-22T08:00:00.000Z",
      reminder_at: "2026-07-22T07:45:00.000Z",
      status: "open"
    });
    expect(plan.tagsToCopy.map((tag) => tag.id)).toEqual(["tag-1"]);
  });

  it("builds linked reminder inserts for the replacement task only when needed", () => {
    expect(buildTaskReminderInsert({ ...baseTask, id: "next-task", reminder_at: "2026-07-22T07:45:00.000Z" })).toEqual({
      user_id: "user-1",
      task_id: "next-task",
      title: "Stretch",
      body: "Mobility",
      remind_at: "2026-07-22T07:45:00.000Z",
      status: "scheduled"
    });
    expect(buildTaskReminderInsert({ ...baseTask, id: "next-task", reminder_at: null })).toBeNull();
  });
});
