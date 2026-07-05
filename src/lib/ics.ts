import type { CalendarEvent } from "@/lib/calendar";

const defaultDurationMinutes = 60;

export function buildIcsCalendar(events: CalendarEvent[], options: { generatedAt?: Date; calendarName?: string } = {}) {
  const generatedAt = options.generatedAt ?? new Date();
  const calendarName = options.calendarName ?? "Orbit Agenda";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Orbit//Life Dashboard//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...events.flatMap((event) => buildIcsEvent(event, generatedAt)),
    "END:VCALENDAR"
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function downloadIcsCalendar(filename: string, events: CalendarEvent[]) {
  const blob = new Blob([buildIcsCalendar(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildIcsEvent(event: CalendarEvent, generatedAt: Date) {
  const start = new Date(event.at);
  const end = new Date(start.getTime() + defaultDurationMinutes * 60_000);
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.id)}@orbit.local`,
    `DTSTAMP:${formatIcsDate(generatedAt)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText([event.detail, event.kind, event.href].filter(Boolean).join(" · "))}`,
    `CATEGORIES:${escapeIcsText(event.kind)}`,
    "END:VEVENT"
  ];
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
