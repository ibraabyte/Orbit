export type SnoozePreset = "15m" | "1h" | "tomorrow";

export const SNOOZE_PRESETS: SnoozePreset[] = ["15m", "1h", "tomorrow"];

export function snoozeReminderAt(preset: SnoozePreset, now = new Date()) {
  const target = new Date(now);

  if (preset === "15m") {
    target.setMinutes(target.getMinutes() + 15);
    return target.toISOString();
  }

  if (preset === "1h") {
    target.setHours(target.getHours() + 1);
    return target.toISOString();
  }

  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return target.toISOString();
}

export function postponeReminderAt(preset: SnoozePreset, remindAt: string, now = new Date()) {
  const current = new Date(remindAt);
  const currentTime = current.getTime();
  const base = Number.isFinite(currentTime) && currentTime > now.getTime() ? current : now;

  return snoozeReminderAt(preset, base);
}

export function snoozePresetLabel(preset: SnoozePreset) {
  if (preset === "15m") return "15m";
  if (preset === "1h") return "1h";
  return "Tomorrow";
}
