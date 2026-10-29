import type { Tag, Tagging } from "@/lib/types";

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
