import type { JournalEntry, JournalMood } from "@/lib/types";

const moodScores: Record<JournalMood, number> = {
  great: 5,
  good: 4,
  neutral: 3,
  low: 2,
  bad: 1
};

export function moodScore(mood: JournalMood) {
  return moodScores[mood];
}

export function journalEntriesInLastDays(entries: JournalEntry[], days: number, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return entries.filter((entry) => new Date(`${entry.entry_date}T00:00:00`).getTime() >= start.getTime());
}

export function averageMood(entries: JournalEntry[]) {
  if (!entries.length) return null;
  const score = entries.reduce((sum, entry) => sum + moodScore(entry.mood), 0) / entries.length;
  if (score >= 4.5) return "great";
  if (score >= 3.5) return "good";
  if (score >= 2.5) return "neutral";
  if (score >= 1.5) return "low";
  return "bad";
}

export function todayEntry(entries: JournalEntry[], now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return entries.find((entry) => entry.entry_date === today) ?? null;
}
