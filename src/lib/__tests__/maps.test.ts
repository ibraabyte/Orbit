import { describe, expect, it, vi } from "vitest";
import { dayPlanBody } from "@/lib/day-plan";
import { leaveAlerts, leaveLine, mapsApi, parseTravelPrefs, tasksToTime, type LeaveTime } from "@/lib/maps";
import { notificationAllowed, NOTIFICATION_DEFAULT, parseNotificationPrefs } from "@/lib/notification-prefs";
import type { Task } from "@/lib/types";

// Made-up appointments and places only.
const NOW = new Date(2026, 10, 20, 8, 0);
const at = (hour: number, minute = 0) => new Date(2026, 10, 20, hour, minute).toISOString();

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1", user_id: "u1", title: "Dentist", notes: null, status: "open", priority: "normal", due_at: at(16), reminder_at: null,
    reminder_sent_at: null, recurrence: null, list_id: null, place_name: "Made-up Clinic", place_id: null,
    created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...overrides
  };
}

function leave(overrides: Partial<LeaveTime>): LeaveTime {
  return { task_id: "t1", title: "Dentist", place_name: "Made-up Clinic", due_at: at(16), travel_minutes: 35, meters: 12400, leave_at: at(15, 15), status: "ok", ...overrides };
}

describe("leave-time alerts", () => {
  it("times only open tasks with a place and a set time in the next day", () => {
    const tasks = [
      task({ id: "a" }),
      task({ id: "b", place_name: null }),
      task({ id: "c", status: "done" }),
      task({ id: "d", due_at: at(7) }),
      task({ id: "e", due_at: new Date(2026, 10, 21, 0, 0).toISOString() }),
      task({ id: "f", due_at: new Date(2026, 10, 22, 9, 0).toISOString() })
    ];
    expect(tasksToTime(tasks, NOW).map((item) => item.id)).toEqual(["a"]);
  });

  it("schedules at the time to leave, says leave now when it passed, and skips no way and past appointments", () => {
    const alerts = leaveAlerts(
      [leave({}), leave({ task_id: "t2", title: "Coffee", due_at: at(8, 20), leave_at: at(7, 45), status: "late" }), leave({ task_id: "t3", status: "no_route", leave_at: null, travel_minutes: null }), leave({ task_id: "t4", due_at: at(7), leave_at: at(6) })],
      NOW
    );
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({ taskId: "t1", at: new Date(at(15, 15)), id: `leave-t1-${new Date(at(15, 15)).getTime()}`, once: `t1@${new Date(at(16)).getTime()}` });
    expect(alerts[0].title).toContain("Dentist");
    expect(alerts[0].body).toContain("Made-up Clinic");
    expect(alerts[0].body).toContain("35 min");
    expect(alerts[1]).toMatchObject({ taskId: "t2", at: null });
    expect(alerts[1].title).toContain("Leave now");
  });

  it("writes the leave line", () => {
    expect(leaveLine(leave({ travel_minutes: 95 }))).toContain("1 h 35 min");
    expect(leaveLine(leave({ status: "late" }))).toMatch(/^Leave now · 35 min$/);
    expect(leaveLine(leave({ status: "no_route", leave_at: null, travel_minutes: null }))).toBe("Google found no way there");
  });

  it("reads the travel choice, falling back field by field", () => {
    expect(parseTravelPrefs(null)).toEqual({ mode: "drive", buffer: 10 });
    expect(parseTravelPrefs('{"mode":"walk","buffer":20}')).toEqual({ mode: "walk", buffer: 20 });
    expect(parseTravelPrefs('{"mode":"plane","buffer":7}')).toEqual({ mode: "drive", buffer: 10 });
    expect(parseTravelPrefs("not json")).toEqual({ mode: "drive", buffer: 10 });
  });

  it("is a notification kind of its own, on by default, that can be switched off", () => {
    expect(notificationAllowed(NOTIFICATION_DEFAULT, "leave")).toBe(true);
    expect(notificationAllowed(parseNotificationPrefs('{"kinds":{"leave":false}}'), "leave")).toBe(false);
  });

  it("calls the server with the position, travel mode and time to spare", async () => {
    const api = { get: vi.fn(), post: vi.fn().mockResolvedValue({ items: [] }), put: vi.fn(), delete: vi.fn() };
    await mapsApi.leave(api, { lat: 24.7, lng: 46.68 }, { mode: "transit", buffer: 5 });
    expect(api.post).toHaveBeenCalledWith("/maps/leave", { origin: { lat: 24.7, lng: 46.68 }, mode: "transit", buffer_minutes: 5, locale: "en" });
    await mapsApi.places(api, " clinic ", null);
    expect(api.post).toHaveBeenLastCalledWith("/maps/places", { query: "clinic", near: null, locale: "en" });
    await mapsApi.connect(api, " made-up-key ");
    expect(api.put).toHaveBeenCalledWith("/maps/key", { api_key: "made-up-key" });
  });

  it("sends the position with the day plan only when travel is given", () => {
    expect(dayPlanBody([], NOW, "en")).not.toHaveProperty("origin");
    expect(dayPlanBody([], NOW, "en", { origin: { lat: 1, lng: 2 }, prefs: { mode: "walk", buffer: 0 } })).toMatchObject({ origin: { lat: 1, lng: 2 }, travel_mode: "walk", buffer_minutes: 0 });
  });
});
