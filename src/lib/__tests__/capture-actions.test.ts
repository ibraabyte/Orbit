import { describe, expect, it } from "vitest";
import {
  captureReminderBody,
  captureReminderTitle,
  captureTaskNotes,
  captureTaskTitle,
  createReminderFromCapture,
  createTaskFromCapture,
  defaultCaptureReminderAt,
  type CaptureActionClient
} from "@/lib/capture-actions";
import type { Attachment, Capture, Reminder, Tag, Task } from "@/lib/types";

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "capture-1",
    user_id: "user-1",
    type: "link",
    url: "https://x.com/example/status/1",
    title: "Hypertrophy thread",
    note: "Apply this to next workout block.",
    source: "x.com",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: "attachment-1",
    user_id: "user-1",
    capture_id: "capture-1",
    bucket: "orbit-attachments",
    object_path: "user-1/capture-1/image.png",
    filename: "image.png",
    content_type: "image/png",
    size_bytes: 1200,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("capture actions", () => {
  it("formats task titles and notes from capture context", () => {
    expect(captureTaskTitle(capture())).toBe("Review: Hypertrophy thread");
    expect(captureTaskNotes(capture(), [attachment({ filename: "screenshot.png" })])).toBe(
      ["Apply this to next workout block.", "Link: https://x.com/example/status/1", "Source: X / Twitter", "Attachments: screenshot.png"].join("\n")
    );
  });

  it("formats reminder titles, bodies, and default reminder time from capture context", () => {
    const now = new Date(2026, 6, 1, 12, 0, 0, 0);
    const tomorrowMorning = new Date(2026, 6, 2, 9, 0, 0, 0);

    expect(captureReminderTitle(capture())).toBe("Follow up: Hypertrophy thread");
    expect(captureReminderBody(capture(), [attachment({ filename: "screenshot.png" })])).toBe(captureTaskNotes(capture(), [attachment({ filename: "screenshot.png" })]));
    expect(defaultCaptureReminderAt(now)).toBe(tomorrowMorning.toISOString());
  });

  it("creates a task from a capture and marks both records with workflow tags", async () => {
    const { supabase, state } = fakeSupabase();

    const task = await createTaskFromCapture("user-1", capture(), [attachment()], supabase);

    expect(task.id).toBe("task-1");
    expect(state.taskInserts[0]).toMatchObject({
      user_id: "user-1",
      title: "Review: Hypertrophy thread",
      priority: "normal",
      status: "open"
    });
    expect(state.tagInserts.map((tag) => tag.name)).toEqual(["from-capture", "tasked"]);
    expect(state.taggingUpserts.flat()).toEqual([
      { user_id: "user-1", tag_id: "tag-from-capture", target_type: "task", target_id: "task-1" },
      { user_id: "user-1", tag_id: "tag-tasked", target_type: "capture", target_id: "capture-1" }
    ]);
  });

  it("creates a reminder from a capture and marks the capture with a workflow tag", async () => {
    const { supabase, state } = fakeSupabase();

    const reminder = await createReminderFromCapture("user-1", capture(), [attachment()], "2026-07-02T09:00:00.000Z", supabase);

    expect(reminder.id).toBe("reminder-1");
    expect(state.reminderInserts[0]).toMatchObject({
      user_id: "user-1",
      task_id: null,
      title: "Follow up: Hypertrophy thread",
      status: "scheduled",
      remind_at: "2026-07-02T09:00:00.000Z"
    });
    expect(state.tagInserts.map((tag) => tag.name)).toEqual(["reminded"]);
    expect(state.taggingUpserts.flat()).toEqual([{ user_id: "user-1", tag_id: "tag-reminded", target_type: "capture", target_id: "capture-1" }]);
  });

  it("rolls back the created task if capture tagging fails", async () => {
    const { supabase, state } = fakeSupabase({ failCaptureTagging: true });

    await expect(createTaskFromCapture("user-1", capture(), [], supabase)).rejects.toThrow("Capture tag failed");

    expect(state.taskInserts).toHaveLength(1);
    expect(state.deletedTasks).toEqual(["task-1"]);
    expect(state.deletedTaskTaggings).toEqual(["task-1"]);
  });

  it("rolls back the created reminder if capture tagging fails", async () => {
    const { supabase, state } = fakeSupabase({ failCaptureTagging: true });

    await expect(createReminderFromCapture("user-1", capture(), [], "2026-07-02T09:00:00.000Z", supabase)).rejects.toThrow("Capture tag failed");

    expect(state.reminderInserts).toHaveLength(1);
    expect(state.deletedReminders).toEqual(["reminder-1"]);
  });
});

function fakeSupabase({ failCaptureTagging = false } = {}) {
  const state = {
    taskInserts: [] as Array<Record<string, unknown>>,
    reminderInserts: [] as Array<Record<string, unknown>>,
    tagInserts: [] as Array<Record<string, unknown>>,
    taggingUpserts: [] as Array<Array<Record<string, unknown>>>,
    deletedTasks: [] as string[],
    deletedReminders: [] as string[],
    deletedTaskTaggings: [] as string[],
    tags: [] as Tag[]
  };

  const supabase = {
    from(table: string) {
      if (table === "tasks") {
        return {
          insert(payload: Record<string, unknown>) {
            state.taskInserts.push(payload);
            const task: Task = {
              id: "task-1",
              user_id: payload.user_id as string,
              title: payload.title as string,
              notes: payload.notes as string | null,
              status: "open",
              priority: "normal",
              due_at: null,
              reminder_at: null,
              reminder_sent_at: null,
              recurrence: null,
              created_at: "2026-07-01T00:00:00.000Z",
              updated_at: "2026-07-01T00:00:00.000Z"
            };
            return selectedSingle({ data: task, error: null });
          },
          delete() {
            return deleteChain((filters) => {
              const id = filters.get("id");
              if (id) state.deletedTasks.push(id);
            });
          }
        };
      }

      if (table === "reminders") {
        return {
          insert(payload: Record<string, unknown>) {
            state.reminderInserts.push(payload);
            const reminder: Reminder = {
              id: "reminder-1",
              user_id: payload.user_id as string,
              task_id: null,
              title: payload.title as string,
              body: payload.body as string | null,
              remind_at: payload.remind_at as string,
              status: "scheduled",
              sent_at: null,
              created_at: "2026-07-01T00:00:00.000Z"
            };
            return selectedSingle({ data: reminder, error: null });
          },
          delete() {
            return deleteChain((filters) => {
              const id = filters.get("id");
              if (id) state.deletedReminders.push(id);
            });
          }
        };
      }

      if (table === "tags") {
        return {
          select() {
            return {
              eq() {
                return Promise.resolve({ data: state.tags, error: null });
              }
            };
          },
          insert(payload: Record<string, unknown>) {
            state.tagInserts.push(payload);
            const tag: Tag = {
              id: `tag-${payload.name}`,
              user_id: payload.user_id as string,
              name: payload.name as string,
              color: null,
              created_at: "2026-07-01T00:00:00.000Z"
            };
            state.tags.push(tag);
            return selectedSingle({ data: tag, error: null });
          }
        };
      }

      if (table === "taggings") {
        return {
          upsert(payload: Array<Record<string, unknown>>) {
            if (failCaptureTagging && payload.some((row) => row.target_type === "capture")) {
              return Promise.resolve({ data: null, error: { message: "Capture tag failed" } });
            }
            state.taggingUpserts.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
          delete() {
            return deleteChain((filters) => {
              const targetId = filters.get("target_id");
              if (filters.get("target_type") === "task" && targetId) state.deletedTaskTaggings.push(targetId);
            });
          }
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  };

  return { supabase: supabase as unknown as CaptureActionClient, state };
}

function selectedSingle<T>(result: { data: T; error: { message: string } | null }) {
  return {
    select() {
      return {
        single() {
          return Promise.resolve(result);
        }
      };
    }
  };
}

function deleteChain(onDone: (filters: Map<string, string>) => void) {
  const filters = new Map<string, string>();
  const chain = {
    eq(field: string, value: string) {
      filters.set(field, value);
      return chain;
    },
    then(resolve: (value: { data: null; error: null }) => void) {
      onDone(filters);
      resolve({ data: null, error: null });
    }
  };
  return chain;
}
