const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function isToday(value: string | null | undefined, now = new Date()) {
  if (!value) return false;
  const target = new Date(value);
  return startOfLocalDay(target).getTime() === startOfLocalDay(now).getTime();
}

export function isPastDue(value: string | null | undefined, now = new Date()) {
  if (!value) return false;
  return new Date(value).getTime() < now.getTime();
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "No time";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function todayInputValue(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function dateInputToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}
