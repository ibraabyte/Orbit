import { describe, expect, it, vi } from "vitest";
import { apiCompleteTask, apiQuickAdd, apiUpdate, quickAddRequest } from "@/lib/api-actions";
import { parseQuickAdd, type QuickAddKind } from "@/lib/quick-add";

function fakeApi() {
  return {
    post: vi.fn(async (path: string, body?: unknown) => ({ path, body })),
    put: vi.fn(async (path: string, body?: unknown) => ({ path, body })),
    patch: vi.fn(async (path: string, body?: unknown) => ({ path, body }))
  };
}

const now = new Date("2026-07-01T08:00:00.000Z");

describe("api actions", () => {
  it("adds a task in one call with its tags; the server schedules its reminder", async () => {
    const api = fakeApi();
    await apiQuickAdd(api as never, parseQuickAdd("task: Book dentist !high #admin @2026-07-02T09:00 ~2026-07-01T20:00"));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe("/tasks");
    expect(body).toMatchObject({ title: "Book dentist", priority: "high", recurrence: null, tags: ["admin"] });
    expect((body as { due_at: string }).due_at).toContain("2026-07-02");
    expect((body as { reminder_at: string }).reminder_at).toContain("2026-07-01");
    expect(body).not.toHaveProperty("user_id");
  });

  it("sends a task's list by name and its checklist in the same call", () => {
    const { body } = quickAddRequest(parseQuickAdd("task: Pack +Travel; Passport; Charger"), now);
    expect(body).toMatchObject({ title: "Pack", list_name: "Travel", steps: ["Passport", "Charger"] });
    expect(quickAddRequest(parseQuickAdd("task: Plain"), now).body).toMatchObject({ list_name: null, steps: [] });
  });

  it("adds a reminder", async () => {
    const api = fakeApi();
    await apiQuickAdd(api as never, parseQuickAdd("reminder: Call mum ~2026-07-01T20:00"));
    expect(api.post.mock.calls[0][0]).toBe("/reminders");
    expect(api.post.mock.calls[0][1]).toMatchObject({ title: "Call mum" });
  });

  it("sends every kind to its own route, never with a user_id", () => {
    const lines: Record<QuickAddKind, string> = {
      task: "task: Pay rent",
      reminder: "reminder: Call ~2026-07-01T20:00",
      capture: "link: https://example.com/post",
      meal: "meal: Chicken bowl 650cal #lunch",
      mealPlan: "mealplan: Kabsa dinner @2026-07-03",
      grocery: "grocery: Rice 2kg",
      workout: "workout: Run 30min",
      weight: "weight: 82kg",
      sleep: "sleep: 7.5h",
      expense: "expense: Coffee 18 SAR",
      bill: "bill: Internet 299 SAR monthly",
      habit: "habit: Read daily"
    };
    const paths: Record<string, string> = {};
    for (const [kind, line] of Object.entries(lines)) {
      const draft = parseQuickAdd(line);
      expect(draft.kind, line).toBe(kind);
      const request = quickAddRequest(draft, now);
      expect(request.body, line).not.toHaveProperty("user_id");
      paths[kind] = `${request.method} ${request.path}`;
    }
    expect(paths).toEqual({
      task: "post /tasks",
      reminder: "post /reminders",
      capture: "post /captures",
      meal: "post /meals",
      mealPlan: "post /meal-plans",
      grocery: "post /grocery-items",
      workout: "post /workouts",
      weight: "post /weight-logs",
      sleep: "post /sleep-logs",
      expense: "post /expenses",
      bill: "post /bills",
      habit: "post /habits"
    });
  });

  it("adds bills with autopay and tags", () => {
    const request = quickAddRequest(parseQuickAdd("bill: Internet 65 USD monthly autopay @2026-07-10 #home"), now);
    expect(request.body).toMatchObject({ name: "Internet", amount: 65, currency: "USD", recurrence: "monthly", autopay: true, due_at: "2026-07-10", tags: ["home"] });
  });

  it("still validates before sending", async () => {
    const api = fakeApi();
    await expect(apiQuickAdd(api as never, parseQuickAdd("expense: Coffee"))).rejects.toThrow();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("completes a task on the server", async () => {
    const api = fakeApi();
    await apiCompleteTask(api as never, "abc-123");
    expect(api.post).toHaveBeenCalledWith("/tasks/abc-123/complete");
  });

  it("updates one row by id", async () => {
    const api = fakeApi();
    await apiUpdate(api as never, "/bills", "b/1", { status: "paid" });
    expect(api.patch).toHaveBeenCalledWith("/bills/b%2F1", { status: "paid" });
  });
});
