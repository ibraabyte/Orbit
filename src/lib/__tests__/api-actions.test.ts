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
      person: "person: Test Person",
      workout: "workout: Run 30min",
      weight: "weight: 82kg",
      sleep: "sleep: 7.5h",
      focus: "focus: Deep work 50min",
      expense: "expense: Coffee 18 SAR",
      bill: "bill: Internet 299 SAR monthly",
      habit: "habit: Read daily",
      goal: "goal: Run 10k",
      journal: "journal: A calm day"
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
      person: "post /people",
      workout: "post /workouts",
      weight: "post /weight-logs",
      sleep: "post /sleep-logs",
      focus: "post /focus-sessions",
      expense: "post /expenses",
      bill: "post /bills",
      habit: "post /habits",
      goal: "post /goals",
      journal: "put /journal-entries/day/2026-07-01"
    });
  });

  it("adds people with relationship, contact method, birthday, and follow-up date", () => {
    const request = quickAddRequest(parseQuickAdd("person: Sara relationship friend via WhatsApp birthday 1996-07-12 favorite @2026-07-08"), now);
    expect(request.body).toMatchObject({
      name: "Sara",
      relationship: "friend",
      contact_method: "WhatsApp",
      birthday: "1996-07-12",
      next_follow_up_at: "2026-07-08",
      favorite: true
    });
  });

  it("adds bills with autopay and tags", () => {
    const request = quickAddRequest(parseQuickAdd("bill: Internet 65 USD monthly autopay @2026-07-10 #home"), now);
    expect(request.body).toMatchObject({ name: "Internet", amount: 65, currency: "USD", recurrence: "monthly", autopay: true, due_at: "2026-07-10", tags: ["home"] });
  });

  it("marks a future focus block as planned and a past one as done", () => {
    const planned = quickAddRequest(parseQuickAdd("focus: Write 50min @2026-07-02T09:00"), now).body;
    expect(planned).toMatchObject({ status: "planned", ended_at: null, energy: null });
    const done = quickAddRequest(parseQuickAdd("focus: Write 50min"), now).body;
    expect(done).toMatchObject({ status: "completed", started_at: now.toISOString(), ended_at: "2026-07-01T08:50:00.000Z" });
  });

  it("writes the journal through the one-entry-per-day route", async () => {
    const api = fakeApi();
    await apiQuickAdd(api as never, parseQuickAdd("journal: A calm day @2026-07-04"));
    expect(api.put).toHaveBeenCalledWith("/journal-entries/day/2026-07-04", expect.objectContaining({ body: "A calm day" }));
    expect(api.post).not.toHaveBeenCalled();
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
