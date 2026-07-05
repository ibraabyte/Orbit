import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Database, Tag, Tagging } from "@/lib/types";

export type TagTargetType = Tagging["target_type"];

export function parseTagInput(input: string) {
  const seen = new Set<string>();
  return input
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function tagsForTarget(tags: Tag[], taggings: Tagging[], targetType: TagTargetType, targetId: string) {
  const ids = new Set(
    taggings
      .filter((tagging) => tagging.target_type === targetType && tagging.target_id === targetId)
      .map((tagging) => tagging.tag_id)
  );

  return tags.filter((tag) => ids.has(tag.id));
}

export function targetMatchesTag(taggings: Tagging[], tagId: string | null, targetType: TagTargetType, targetId: string) {
  if (!tagId) return true;
  return taggings.some((tagging) => tagging.tag_id === tagId && tagging.target_type === targetType && tagging.target_id === targetId);
}

export function textMatchesQuery(query: string, values: Array<string | null | undefined>) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

export async function ensureTags(userId: string, names: string[], supabase: SupabaseClient<Database> = getSupabase()) {
  if (!names.length) return [];

  const { data: existing, error: existingError } = await supabase.from("tags").select("*").eq("user_id", userId);
  if (existingError) throw new Error(existingError.message);

  const existingTags = (existing ?? []) as Tag[];
  const byName = new Map(existingTags.map((tag) => [tag.name.toLowerCase(), tag]));
  const resolved: Tag[] = [];

  for (const name of names) {
    const current = byName.get(name.toLowerCase());
    if (current) {
      resolved.push(current);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("tags")
      .insert({
        user_id: userId,
        name,
        color: null
      })
      .select()
      .single();

    if (error || !inserted) throw new Error(error?.message ?? `Tag "${name}" could not be created.`);
    const tag = inserted as Tag;
    byName.set(tag.name.toLowerCase(), tag);
    resolved.push(tag);
  }

  return resolved;
}

export async function createTaggings(
  userId: string,
  targetType: TagTargetType,
  targetId: string,
  tags: Tag[],
  supabase: SupabaseClient<Database> = getSupabase()
) {
  if (!tags.length) return;

  const { error } = await supabase.from("taggings").upsert(
    tags.map((tag) => ({
      user_id: userId,
      tag_id: tag.id,
      target_type: targetType,
      target_id: targetId
    })),
    { onConflict: "user_id,tag_id,target_type,target_id" }
  );
  if (error) throw new Error(error.message);
}
