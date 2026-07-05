import type { SupabaseClient } from "@supabase/supabase-js";
import { localDateKey } from "@/lib/insights";
import { getSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

export type PeopleActionClient = SupabaseClient<Database>;

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

export async function markPersonContacted(
  userId: string,
  personId: string,
  nextFollowUpDays: number | null = 30,
  now = new Date(),
  supabase: PeopleActionClient = getSupabase()
) {
  const update = contactedUpdate(nextFollowUpDays, now);
  const { error } = await supabase.from("people").update(update).eq("id", personId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return update;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
