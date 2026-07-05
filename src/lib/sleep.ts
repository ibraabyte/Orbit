import type { DailyMetric } from "@/lib/insights";
import type { DashboardData, SleepLog } from "@/lib/types";

export function formatSleepDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function sleepByDay(data: Pick<DashboardData, "sleepLogs">, days = 7, now = new Date()): DailyMetric[] {
  return lastDays(days, now).map((day) => ({
    ...day,
    value: data.sleepLogs
      .filter((log) => log.sleep_date === day.date)
      .reduce((sum, log) => sum + log.duration_minutes, 0)
  }));
}

export function sleepLogsInLastDays(logs: SleepLog[], days: number, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return logs.filter((log) => new Date(`${log.sleep_date}T12:00:00`).getTime() >= start.getTime());
}

export function averageSleepMinutes(logs: SleepLog[]) {
  if (!logs.length) return 0;
  return Math.round(logs.reduce((sum, log) => sum + log.duration_minutes, 0) / logs.length);
}

export function averageSleepQuality(logs: SleepLog[]) {
  const rated = logs.filter((log) => typeof log.quality === "number");
  if (!rated.length) return null;
  return Number((rated.reduce((sum, log) => sum + (log.quality ?? 0), 0) / rated.length).toFixed(1));
}

export function sleepSummary(data: Pick<DashboardData, "sleepLogs">, now = new Date()) {
  const recent = sleepLogsInLastDays(data.sleepLogs, 7, now);
  const todayKey = localDate(now);
  const todayMinutes = data.sleepLogs
    .filter((log) => log.sleep_date === todayKey)
    .reduce((sum, log) => sum + log.duration_minutes, 0);

  return {
    todayMinutes,
    sevenDayAverageMinutes: averageSleepMinutes(recent),
    sevenDayQuality: averageSleepQuality(recent),
    nightsLogged: recent.length,
    lastLog: data.sleepLogs[0] ?? null
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
