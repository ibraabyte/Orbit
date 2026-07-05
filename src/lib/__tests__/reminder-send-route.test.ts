import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, runtime } from "@/app/api/reminders/send/route";
import type { Reminder, Task } from "@/lib/types";

const cronSecret = "orbit-cron-secret-for-production-tests";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn()
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails
  }
}));

const originalEnv = { ...process.env };

describe("/api/reminders/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://orbit.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
      VAPID_PRIVATE_KEY: "private-key",
      VAPID_SUBJECT: "mailto:test@example.com",
      CRON_SECRET: cronSecret,
      NODE_ENV: "production"
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("marks delivered reminders only after a successful push send", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1", task_id: "task-1" })],
      tasks: [task({ id: "task-1" })],
      subscriptions: [subscription({ id: "subscription-1" })]
    });
    mocks.createClient.mockReturnValue(supabase.client);
    mocks.sendNotification.mockResolvedValue(undefined);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      notifications: 1,
      reminders: 1,
      taskReminders: 0,
      deliveredNotifications: 1,
      deliveryMarkFailures: 0,
      sent: 1,
      failedDeliveries: 0,
      subscriptionsChecked: 1,
      notificationsWithoutSubscriptions: 0
    });
    expect(supabase.updates.map((update) => [update.table, update.payload])).toEqual([
      ["tasks", { reminder_sent_at: expect.any(String) }],
      ["reminders", { status: "sent", sent_at: expect.any(String) }]
    ]);
    expect(JSON.parse(mocks.sendNotification.mock.calls[0]?.[1] as string)).toEqual({
      title: "Reminder",
      body: "A reminder is due.",
      url: "/tasks"
    });
  });

  it("uses the Node.js runtime required by web-push", () => {
    expect(runtime).toBe("nodejs");
  });

  it("fails closed when the production cron secret is weak", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = await GET(
      new Request("https://orbit.test/api/reminders/send", {
        headers: {
          authorization: "Bearer cron-secret"
        }
      }) as never
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Unsafe CRON_SECRET" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("returns a failure when a pushed notification cannot be marked delivered", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1", task_id: "task-1" })],
      tasks: [task({ id: "task-1" })],
      subscriptions: [subscription({ id: "subscription-1" })],
      updateErrors: { tasks: "task mark failed" }
    });
    mocks.createClient.mockReturnValue(supabase.client);
    mocks.sendNotification.mockResolvedValue(undefined);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      deliveredNotifications: 0,
      deliveryMarkFailures: 1,
      sent: 1,
      failedDeliveries: 0
    });
    expect(supabase.updates.map((update) => update.table)).toEqual(["tasks"]);
  });

  it("removes expired push subscriptions without marking the reminder delivered", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1" })],
      tasks: [],
      subscriptions: [subscription({ id: "expired-subscription" })]
    });
    mocks.createClient.mockReturnValue(supabase.client);
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      deliveredNotifications: 0,
      sent: 0,
      failedDeliveries: 1,
      failedSubscriptions: 0,
      removedSubscriptions: 1
    });
    expect(supabase.updates).toEqual([]);
    expect(supabase.deletedSubscriptionIds).toEqual(["expired-subscription"]);
  });

  it("returns a failure for non-expired push delivery errors", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1" })],
      tasks: [],
      subscriptions: [subscription({ id: "subscription-1" })]
    });
    mocks.createClient.mockReturnValue(supabase.client);
    mocks.sendNotification.mockRejectedValue({ statusCode: 503 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      deliveredNotifications: 0,
      sent: 0,
      failedDeliveries: 1,
      failedSubscriptions: 1,
      removedSubscriptions: 0
    });
    expect(supabase.updates).toEqual([]);
    expect(supabase.deletedSubscriptionIds).toEqual([]);
  });

  it("reports due notifications that have no browser subscriptions", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1" })],
      tasks: [],
      subscriptions: []
    });
    mocks.createClient.mockReturnValue(supabase.client);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      notifications: 1,
      subscriptionsChecked: 0,
      notificationsWithoutSubscriptions: 1,
      sent: 0,
      failedDeliveries: 0
    });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("reports subscription cleanup failures", async () => {
    const supabase = mockReminderSendClient({
      reminders: [reminder({ id: "reminder-1" })],
      tasks: [],
      subscriptions: [subscription({ id: "expired-subscription" })],
      deleteError: "cleanup failed"
    });
    mocks.createClient.mockReturnValue(supabase.client);
    mocks.sendNotification.mockRejectedValue({ statusCode: 410 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      subscriptionCleanupFailures: 1,
      removedSubscriptions: 0
    });
  });
});

function request() {
  return new Request("https://orbit.test/api/reminders/send", {
    headers: {
      authorization: `Bearer ${cronSecret}`
    }
  }) as never;
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "reminder-1",
    user_id: "user-1",
    task_id: null,
    title: "Reminder",
    body: null,
    remind_at: "2020-01-01T10:00:00.000Z",
    status: "scheduled",
    sent_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: "user-1",
    title: "Task",
    notes: null,
    status: "open",
    priority: "normal",
    due_at: null,
    reminder_at: "2020-01-01T10:00:00.000Z",
    reminder_sent_at: null,
    recurrence: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function subscription(overrides: Partial<PushSubscriptionRow> = {}): PushSubscriptionRow {
  return {
    id: "subscription-1",
    user_id: "user-1",
    endpoint: "https://push.example/subscription-1",
    p256dh: "p256dh",
    auth: "auth",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

function mockReminderSendClient({
  reminders,
  tasks,
  subscriptions,
  updateErrors = {},
  deleteError = null
}: {
  reminders: Reminder[];
  tasks: Task[];
  subscriptions: PushSubscriptionRow[];
  updateErrors?: Partial<Record<"tasks" | "reminders", string>>;
  deleteError?: string | null;
}) {
  const updates: Array<{ table: string; payload: unknown; filters: Array<[string, string | null]> }> = [];
  const deletedSubscriptionIds: string[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return chain(() => {
            if (table === "reminders") return { data: reminders, error: null };
            if (table === "tasks") return { data: tasks, error: null };
            if (table === "push_subscriptions") return { data: subscriptions, error: null };
            return { data: [], error: null };
          });
        },
        update(payload: unknown) {
          const update = { table, payload, filters: [] as Array<[string, string | null]> };
          updates.push(update);
          return chain(() => ({ data: null, error: updateErrors[table as "tasks" | "reminders"] ? { message: updateErrors[table as "tasks" | "reminders"] } : null }), update.filters);
        },
        delete() {
          return {
            in(column: string, values: string[]) {
              if (column === "id") deletedSubscriptionIds.push(...values);
              return chain(() => ({ data: null, error: deleteError ? { message: deleteError } : null }));
            }
          };
        }
      };
    }
  };

  return { client, updates, deletedSubscriptionIds };
}

function chain<T>(resolveResult: () => T, filters: Array<[string, string | null]> = []) {
  const builder = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      return builder;
    },
    is(column: string, value: null) {
      filters.push([column, value]);
      return builder;
    },
    lte(column: string, value: string) {
      filters.push([column, value]);
      return builder;
    },
    not(column: string, _operator: string, value: null) {
      filters.push([column, value]);
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve: (value: T) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(resolveResult()).then(resolve, reject);
    }
  };
  return builder;
}
