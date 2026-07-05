import type { DailyMetric } from "@/lib/insights";
import type { DashboardData, FocusSession } from "@/lib/types";

export function formatFocusDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function focusSessionsInLastDays(sessions: FocusSession[], days: number, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return sessions.filter((session) => new Date(session.started_at).getTime() >= start.getTime());
}

export function completedFocusMinutes(sessions: FocusSession[]) {
  return sessions
    .filter((session) => session.status === "completed")
    .reduce((sum, session) => sum + session.duration_minutes, 0);
}

export function focusMinutesByDay(data: Pick<DashboardData, "focusSessions">, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: completedFocusMinutes(data.focusSessions.filter((session) => session.started_at.slice(0, 10) === day.date))
  }));
}

export function todaysFocusMinutes(sessions: FocusSession[], now = new Date()) {
  const today = localDate(now);
  return completedFocusMinutes(sessions.filter((session) => session.started_at.slice(0, 10) === today));
}

export function upcomingFocusSessions(sessions: FocusSession[], days = 7, now = new Date()) {
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  return sessions
    .filter((session) => session.status === "planned")
    .filter((session) => {
      const startedAt = new Date(session.started_at);
      return startedAt >= now && startedAt <= end;
    })
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
}

export function overdueFocusSessions(sessions: FocusSession[], now = new Date()) {
  return sessions
    .filter((session) => session.status === "planned" && new Date(session.started_at).getTime() < now.getTime())
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
}

export function averageFocusEnergy(sessions: FocusSession[]) {
  const rated = sessions.filter((session) => typeof session.energy === "number" && session.status === "completed");
  if (!rated.length) return null;
  return Number((rated.reduce((sum, session) => sum + (session.energy ?? 0), 0) / rated.length).toFixed(1));
}

export function focusSummary(data: Pick<DashboardData, "focusSessions">, now = new Date()) {
  const recent = focusSessionsInLastDays(data.focusSessions, 7, now);
  const completedRecent = recent.filter((session) => session.status === "completed");

  return {
    todayMinutes: todaysFocusMinutes(data.focusSessions, now),
    weekMinutes: completedFocusMinutes(recent),
    sessionsLogged: completedRecent.length,
    averageEnergy: averageFocusEnergy(completedRecent),
    plannedUpcoming: upcomingFocusSessions(data.focusSessions, 7, now),
    plannedOverdue: overdueFocusSessions(data.focusSessions, now)
  };
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function lastDays(days: number, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (days - index - 1));
    return {
      date: localDate(date),
      label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)
    };
  });
}
