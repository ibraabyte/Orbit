import { describe, expect, it } from "vitest";
import { executeQuickAdd } from "@/lib/quick-add-executor";
import { parseQuickAdd } from "@/lib/quick-add";

type Operation = {
  table: string;
  action: "insert" | "upsert" | "select";
  payload?: unknown;
};

function mockQuickAddClient(options: { fail?: { table: string; action: "insert" | "upsert" | "single"; message: string } } = {}) {
  const operations: Operation[] = [];
  const counters = new Map<string, number>();
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async eq() {
              operations.push({ table, action: "select" });
              return { data: [], error: null };
            }
          };
        },
        insert(payload: Record<string, unknown>) {
          operations.push({ table, action: "insert", payload });
          const result = {
            data: null,
            error: options.fail?.table === table && options.fail.action === "insert" ? { message: options.fail.message } : null
          };

          return {
            select() {
              return {
                async single() {
                  if (options.fail?.table === table && options.fail.action === "single") {
                    return { data: null, error: { message: options.fail.message } };
                  }
                  return { data: rowFor(table, payload, counters), error: null };
                }
              };
            },
            then(resolve: (value: typeof result) => void, reject?: (reason: unknown) => void) {
              return Promise.resolve(result).then(resolve, reject);
            }
          };
        },
        async upsert(payload: Record<string, unknown>[]) {
          operations.push({ table, action: "upsert", payload });
          return {
            error: options.fail?.table === table && options.fail.action === "upsert" ? { message: options.fail.message } : null
          };
        }
      };
    }
  };

  return { client, operations };
}

function rowFor(table: string, payload: Record<string, unknown>, counters: Map<string, number>) {
  const next = (counters.get(table) ?? 0) + 1;
  counters.set(table, next);
  return { ...payload, id: `${table}-${next}`, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" };
}

describe("quick add executor", () => {
  it("creates task commands with linked reminders and copied tags", async () => {
    const { client, operations } = mockQuickAddClient();
    const draft = parseQuickAdd("task: Book dentist !high ~2026-07-02T09:00 #admin");

    await executeQuickAdd("user-1", draft, client as never);

    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["tasks", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"],
      ["reminders", "insert"]
    ]);
    expect(operations.find((operation) => operation.table === "reminders")?.payload).toMatchObject({
      user_id: "user-1",
      task_id: "tasks-1",
      title: "Book dentist",
      remind_at: draft.reminderAt,
      status: "scheduled"
    });
  });

  it("throws when the primary record cannot be saved", async () => {
    const { client, operations } = mockQuickAddClient({ fail: { table: "captures", action: "single", message: "capture denied" } });
    const draft = parseQuickAdd("capture: https://example.com Read later #research");

    await expect(executeQuickAdd("user-1", draft, client as never)).rejects.toThrow("capture denied");
    expect(operations.map((operation) => operation.table)).toEqual(["captures"]);
  });

  it("creates people with relationship, contact method, birthday, and follow-up date", async () => {
    const { client, operations } = mockQuickAddClient();
    const draft = parseQuickAdd("person: Sara relationship friend via WhatsApp birthday 1996-07-12 favorite @2026-07-08");

    await executeQuickAdd("user-1", draft, client as never);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      table: "people",
      action: "insert",
      payload: {
        user_id: "user-1",
        name: "Sara",
        relationship: "friend",
        contact_method: "WhatsApp",
        birthday: "1996-07-12",
        next_follow_up_at: "2026-07-08",
        favorite: true
      }
    });
  });

  it("creates bills with autopay from quick add", async () => {
    const { client, operations } = mockQuickAddClient();
    const draft = parseQuickAdd("bill: Internet 65 USD monthly autopay @2026-07-10 #home");

    await executeQuickAdd("user-1", draft, client as never);

    expect(operations.find((operation) => operation.table === "bills")?.payload).toMatchObject({
      user_id: "user-1",
      name: "Internet",
      amount: 65,
      currency: "USD",
      recurrence: "monthly",
      autopay: true,
      due_at: "2026-07-10"
    });
  });

  it("throws when taggings cannot be saved", async () => {
    const { client } = mockQuickAddClient({ fail: { table: "taggings", action: "upsert", message: "tagging denied" } });
    const draft = parseQuickAdd("meal: Chicken bowl 650cal #protein");

    await expect(executeQuickAdd("user-1", draft, client as never)).rejects.toThrow("tagging denied");
  });

  it("throws when a task reminder cannot be saved", async () => {
    const { client } = mockQuickAddClient({ fail: { table: "reminders", action: "insert", message: "reminder denied" } });
    const draft = parseQuickAdd("task: Book dentist ~2026-07-02T09:00");

    await expect(executeQuickAdd("user-1", draft, client as never)).rejects.toThrow("reminder denied");
  });

  it("validates incomplete commands before creating records", async () => {
    const { client, operations } = mockQuickAddClient();
    const draft = parseQuickAdd("expense: Coffee");

    await expect(executeQuickAdd("user-1", draft, client as never)).rejects.toThrow("Expense commands need an amount like 4.50 USD.");
    expect(operations).toEqual([]);
  });
});
