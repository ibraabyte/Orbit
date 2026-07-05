import { describe, expect, it } from "vitest";
import {
  REMINDER_PUSH_BODY_LIMIT,
  REMINDER_PUSH_TITLE_LIMIT,
  buildDueReminderNotifications,
  buildReminderPushPayload,
  markReminderNotificationDelivered,
  shouldMarkNotificationDelivered
} from "@/lib/reminder-notifications";
import type { Reminder, Task } from "@/lib/types";

const now = new Date("2026-07-01T12:00:00.000Z");

function reminder(overrides: Partial<Reminder>): Reminder {
  return {
    id: "reminder-1",
    user_id: "user-1",
    task_id: null,
    title: "Reminder",
    body: null,
    remind_at: "2026-07-01T10:00:00.000Z",
    status: "scheduled",
    sent_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Task",
    notes: null,
    status: "open",
    priority: "normal",
    due_at: null,
    reminder_at: "2026-07-01T10:00:00.000Z",
    reminder_sent_at: null,
    recurrence: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("reminder notifications", () => {
  it("builds due standalone and direct task reminder notifications", () => {
    const notifications = buildDueReminderNotifications({
      reminders: [reminder({ id: "standalone", title: "Drink water" })],
      tasks: [task({ id: "direct", title: "Call gym", notes: "Ask about class" })],
      now
    });

    expect(notifications).toEqual([
      expect.objectContaining({ id: "reminder-standalone", kind: "reminder", userId: "user-1", title: "Drink water", url: "/dashboard" }),
      expect.objectContaining({ id: "task-direct", kind: "task", userId: "user-1", title: "Call gym", body: "Ask about class", url: "/tasks" })
    ]);
  });

  it("dedupes task reminders already covered by a linked reminder row", () => {
    const notifications = buildDueReminderNotifications({
      reminders: [reminder({ id: "linked", task_id: "task-1", title: "Linked task reminder" })],
      tasks: [task({ id: "task-1", title: "Task with linked reminder" })],
      now
    });

    expect(notifications).toEqual([
      expect.objectContaining({ id: "reminder-linked", kind: "reminder", taskId: "task-1", url: "/tasks" })
    ]);
  });

  it("ignores future, sent, completed, stale linked, and already-notified rows", () => {
    const notifications = buildDueReminderNotifications({
      reminders: [
        reminder({ id: "future", remind_at: "2026-07-02T10:00:00.000Z" }),
        reminder({ id: "sent", status: "sent" }),
        reminder({ id: "done-linked", task_id: "done-linked" }),
        reminder({ id: "notified-linked", task_id: "notified-linked" }),
        reminder({ id: "missing-linked", task_id: "missing-linked" })
      ],
      tasks: [
        task({ id: "done", status: "done" }),
        task({ id: "done-linked", status: "done" }),
        task({ id: "notified-linked", reminder_sent_at: "2026-07-01T10:01:00.000Z" }),
        task({ id: "future", reminder_at: "2026-07-02T10:00:00.000Z" }),
        task({ id: "notified", reminder_sent_at: "2026-07-01T10:01:00.000Z" })
      ],
      now
    });

    expect(notifications).toEqual([]);
  });

  it("only marks a notification delivered after at least one successful push send", () => {
    expect(shouldMarkNotificationDelivered(0)).toBe(false);
    expect(shouldMarkNotificationDelivered(1)).toBe(true);
    expect(shouldMarkNotificationDelivered(3)).toBe(true);
  });

  it("normalizes and clamps push payload text before delivery", () => {
    const payload = buildReminderPushPayload({
      title: `  ${"Important ".repeat(30)}  `,
      body: `Line one\n\n${"long note ".repeat(60)}`,
      url: "/tasks"
    });

    expect(payload.title.length).toBeLessThanOrEqual(REMINDER_PUSH_TITLE_LIMIT);
    expect(payload.title).toMatch(/\.\.\.$/);
    expect(payload.title).not.toMatch(/\s{2,}/);
    expect(payload.body.length).toBeLessThanOrEqual(REMINDER_PUSH_BODY_LIMIT);
    expect(payload.body).toMatch(/\.\.\.$/);
    expect(payload.body).not.toContain("\n");
    expect(payload.url).toBe("/tasks");
  });

  it("falls back to safe push payload values", () => {
    expect(buildReminderPushPayload({ title: "   ", body: "", url: "https://example.com/phishing" })).toEqual({
      title: "Orbit reminder",
      body: "A reminder is due.",
      url: "/dashboard"
    });
    expect(buildReminderPushPayload({ title: "Reminder", body: "Body", url: "//example.com/path" }).url).toBe("/dashboard");
  });

  it("marks linked reminders delivered by updating the task before the reminder row", async () => {
    const { client, operations } = mockDeliveryMarkClient();

    await expect(
      markReminderNotificationDelivered(
        client as never,
        { userId: "user-1", taskId: "task-1", reminderId: "reminder-1" },
        "2026-07-01T12:01:00.000Z"
      )
    ).resolves.toEqual({ marked: true, error: null });
    expect(operations.map((operation) => [operation.table, operation.payload])).toEqual([
      ["tasks", { reminder_sent_at: "2026-07-01T12:01:00.000Z" }],
      ["reminders", { status: "sent", sent_at: "2026-07-01T12:01:00.000Z" }]
    ]);
  });

  it("does not mark a linked reminder sent when the task mark fails", async () => {
    const { client, operations } = mockDeliveryMarkClient({ failTable: "tasks" });

    await expect(
      markReminderNotificationDelivered(
        client as never,
        { userId: "user-1", taskId: "task-1", reminderId: "reminder-1" },
        "2026-07-01T12:01:00.000Z"
      )
    ).resolves.toEqual({ marked: false, error: "tasks failed" });
    expect(operations.map((operation) => operation.table)).toEqual(["tasks"]);
  });

  it("reports reminder mark failures for standalone reminders", async () => {
    const { client } = mockDeliveryMarkClient({ failTable: "reminders" });

    await expect(
      markReminderNotificationDelivered(client as never, { userId: "user-1", reminderId: "reminder-1" }, "2026-07-01T12:01:00.000Z")
    ).resolves.toEqual({ marked: false, error: "reminders failed" });
  });
});

function mockDeliveryMarkClient(options: { failTable?: "tasks" | "reminders" } = {}) {
  const operations: Array<{ table: string; payload: unknown; filters: Array<[string, string]> }> = [];
  const client = {
    from(table: string) {
      return {
        update(payload: unknown) {
          const operation = { table, payload, filters: [] as Array<[string, string]> };
          operations.push(operation);
          const builder = {
            eq(column: string, value: string) {
              operation.filters.push([column, value]);
              return builder;
            },
            then(resolve: (value: { error: { message: string } | null }) => void, reject?: (reason: unknown) => void) {
              const result = { error: options.failTable === table ? { message: `${table} failed` } : null };
              return Promise.resolve(result).then(resolve, reject);
            }
          };
          return builder;
        }
      };
    }
  };

  return { client, operations };
}
