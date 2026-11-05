import { describe, expect, it } from "vitest";
import { ACT_HISTORY_TURNS, ACT_TEXT_MAX, ACT_TURN_MAX, actBody, actionRequest, actionRows, applyActions, instantDraft, kindName, opName, type ProposedAction } from "@/lib/assistant";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const action = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({ op: "create", kind: "expense", id: null, label: "Lunch", fields: { merchant: "Lunch", amount: 45 }, ...overrides });

describe("applying what the person confirmed", () => {
  it("sends each change to that item's own route", () => {
    expect(actionRequest(action())).toEqual({ method: "POST", path: "/expenses", body: { merchant: "Lunch", amount: 45 } });
    expect(actionRequest(action({ op: "update", kind: "task", id: ID, fields: { due_at: "2026-11-06T09:00:00+03:00" } }))).toEqual({
      method: "PATCH",
      path: `/tasks/${ID}`,
      body: { due_at: "2026-11-06T09:00:00+03:00" }
    });
    expect(actionRequest(action({ op: "delete", kind: "grocery", id: ID, fields: {} }))).toEqual({ method: "DELETE", path: `/grocery-items/${ID}` });
    expect(actionRequest(action({ op: "complete", kind: "task", id: ID, fields: {} }))).toEqual({ method: "POST", path: `/tasks/${ID}/complete` });
  });

  it("refuses anything it can't place safely", () => {
    expect(actionRequest(action({ kind: "journal" }))).toBeNull();
    expect(actionRequest(action({ id: ID }))).toBeNull(); // a create never targets a row
    expect(actionRequest(action({ op: "update", id: "../admin/settings" }))).toBeNull();
    expect(actionRequest(action({ op: "update", id: ID, fields: {} }))).toBeNull();
    expect(actionRequest(action({ op: "complete", kind: "expense", id: ID }))).toBeNull();
  });

  it("keeps going after a failure and says which one failed", async () => {
    const calls: string[] = [];
    const api = {
      post: async (path: string) => {
        calls.push(`POST ${path}`);
        if (path === "/reminders") throw new Error("remind_at is required");
        return null as never;
      },
      patch: async (path: string) => {
        calls.push(`PATCH ${path}`);
        return null as never;
      },
      delete: async (path: string) => {
        calls.push(`DELETE ${path}`);
        return null;
      }
    };
    const result = await applyActions(api, [action({ kind: "reminder" }), action(), action({ kind: "nope" }), action({ op: "delete", id: ID })]);
    expect(calls).toEqual(["POST /reminders", "POST /expenses", `DELETE /expenses/${ID}`]);
    expect(result.done).toBe(2);
    expect(result.failed.map((item) => [item.action.kind, item.message])).toEqual([
      ["reminder", "remind_at is required"],
      ["nope", "Not a change Orbit can make."]
    ]);
  });
});

describe("what skips the AI", () => {
  const opts = { defaultCurrency: "SAR", now: new Date("2026-11-05T12:00:00+03:00") };

  it("saves plain quick-add lines at once", () => {
    expect(instantDraft("غداء 45", opts)?.draft).toMatchObject({ kind: "expense", amount: 45 });
    expect(instantDraft("spent 25 lunch", opts)?.draft).toMatchObject({ kind: "expense", amount: 25 });
  });

  it("sends anything else to the assistant", () => {
    expect(instantDraft("", opts)).toBeNull();
    expect(instantDraft("خل مهمة السباك بكرة واحذف تذكير الإيجار", opts)).toBeNull();
    expect(instantDraft("call mom 3", opts)).toBeNull();
    // A guessed kind that falls back to a task is a guess, so the assistant decides.
    expect(instantDraft("غداء", opts)).toBeNull();
  });
});

describe("what goes to the server", () => {
  it("keeps the request and the follow-up history short", () => {
    const history = Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? ("assistant" as const) : ("user" as const), content: "x".repeat(ACT_TURN_MAX + 10) }));
    const body = actBody(`  ${"y".repeat(ACT_TEXT_MAX + 5)}  `, history, "ar");
    expect(body.text).toHaveLength(ACT_TEXT_MAX);
    expect(body.history).toHaveLength(ACT_HISTORY_TURNS);
    expect(body.history.every((turn) => turn.content.length === ACT_TURN_MAX)).toBe(true);
    expect(body.locale).toBe("ar");
  });
});

describe("what the person checks", () => {
  it("names each change and shows the fields that would be sent, without ids", () => {
    expect(`${opName("create", true)} · ${kindName("expense", true)}`).toBe("إضافة · مصروف");
    expect(kindName("grocery", false)).toBe("Grocery");
    const rows = actionRows(action({ kind: "habit_log", fields: { habit_id: ID, note: "10 pages", amount: 1200, autopay: true, due_at: null } }), false);
    expect(rows).toEqual([
      ["Note", "10 pages"],
      ["Amount", "1,200"],
      ["Autopay", "✓"],
      ["Due", "—"]
    ]);
    expect(actionRows(action({ fields: { amount: 1200 } }), true)).toEqual([["المبلغ", "1,200"]]);
  });
});
