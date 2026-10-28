import { describe, expect, it, vi } from "vitest";
import { NOT_ON_SERVER_YET } from "@/lib/api";
import { apiCompleteTask, apiQuickAdd } from "@/lib/api-actions";
import { parseQuickAdd } from "@/lib/quick-add";

function fakeApi() {
  return { post: vi.fn(async (path: string, body?: unknown) => ({ path, body })) };
}

describe("api actions", () => {
  it("adds a task in one call; the server schedules its reminder", async () => {
    const api = fakeApi();
    await apiQuickAdd(api as never, parseQuickAdd("task: Book dentist !high @2026-07-02T09:00 ~2026-07-01T20:00"));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe("/tasks");
    expect(body).toMatchObject({ title: "Book dentist", priority: "high", recurrence: null });
    expect((body as { due_at: string }).due_at).toContain("2026-07-02");
    expect((body as { reminder_at: string }).reminder_at).toContain("2026-07-01");
    expect(body).not.toHaveProperty("user_id");
  });

  it("refuses task tags instead of dropping them", async () => {
    const api = fakeApi();
    await expect(apiQuickAdd(api as never, parseQuickAdd("task: Book dentist #admin"))).rejects.toThrow("Tags aren't on the new server yet");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("adds a reminder", async () => {
    const api = fakeApi();
    await apiQuickAdd(api as never, parseQuickAdd("reminder: Call mum ~2026-07-01T20:00"));
    expect(api.post.mock.calls[0][0]).toBe("/reminders");
    expect(api.post.mock.calls[0][1]).toMatchObject({ title: "Call mum" });
  });

  it("says plainly when a kind hasn't moved to the new server", async () => {
    const api = fakeApi();
    await expect(apiQuickAdd(api as never, parseQuickAdd("meal: Chicken bowl 650cal"))).rejects.toThrow(NOT_ON_SERVER_YET);
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
});
