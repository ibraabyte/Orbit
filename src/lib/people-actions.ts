import type { ApiClient } from "@/lib/api";
import { localDateKey } from "@/lib/insights";

export type ContactedUpdate = {
  last_contacted_at: string;
  next_follow_up_at: string | null;
};

export function contactedUpdate(nextFollowUpDays: number | null = 30, now = new Date()): ContactedUpdate {
  return {
    last_contacted_at: localDateKey(now),
    next_follow_up_at: nextFollowUpDays === null ? null : localDateKey(addDays(now, nextFollowUpDays))
  };
}

export async function markPersonContacted(api: Pick<ApiClient, "patch">, personId: string, nextFollowUpDays: number | null = 30, now = new Date()) {
  const update = contactedUpdate(nextFollowUpDays, now);
  await api.patch(`/people/${encodeURIComponent(personId)}`, update);
  return update;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
