import { describe, expect, it } from "vitest";
import { buildIcsCalendar, escapeIcsText } from "@/lib/ics";
import type { CalendarEvent } from "@/lib/calendar";

const event: CalendarEvent = {
  id: "task-due-1",
  kind: "task",
  title: "Call gym, confirm plan",
  detail: "Due · high; bring notes",
  at: "2026-07-01T14:00:00.000Z",
  href: "/tasks"
};

describe("ics export", () => {
  it("escapes ICS text values", () => {
    expect(escapeIcsText("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
  });

  it("builds a valid calendar with stable event fields", () => {
    const ics = buildIcsCalendar([event], {
      generatedAt: new Date("2026-07-01T09:00:00.000Z"),
      calendarName: "Orbit Test"
    });

    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Orbit Test");
    expect(ics).toContain("UID:task-due-1@orbit.local");
    expect(ics).toContain("DTSTAMP:20260701T090000Z");
    expect(ics).toContain("DTSTART:20260701T140000Z");
    expect(ics).toContain("DTEND:20260701T150000Z");
    expect(ics).toContain("SUMMARY:Call gym\\, confirm plan");
    expect(ics).toContain("DESCRIPTION:Due · high\\; bring notes · task · /tasks");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
