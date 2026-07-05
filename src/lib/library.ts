import type { Attachment, Capture, CaptureType, Tag, Tagging } from "@/lib/types";
import { normalizeSourceHost, sourceAliases, sourceLabel, sourcePlatformFromHost } from "@/lib/url";

export type CaptureSourceOption = {
  source: string;
  label: string;
  count: number;
};

export type CaptureCollection = {
  id: string;
  kind: "source" | "tag";
  value: string;
  label: string;
  count: number;
};

export type CaptureFilter = CaptureType | "all" | "social" | "needs-triage";

function uniqueSearchValues(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function captureSource(capture: Pick<Capture, "source" | "url">) {
  if (capture.source) return normalizeSourceHost(capture.source);
  if (!capture.url) return null;

  try {
    return normalizeSourceHost(new URL(capture.url).hostname);
  } catch {
    return null;
  }
}

export function captureSourceLabel(capture: Pick<Capture, "source" | "url" | "type">) {
  return sourceLabel(captureSource(capture)) ?? capture.type;
}

export function isSocialCapture(capture: Pick<Capture, "source" | "url">) {
  const source = captureSource(capture);
  if (!source) return false;
  return sourcePlatformFromHost(source)?.social ?? false;
}

export function captureNeedsTriage(capture: Capture, taggings: Tagging[] = []) {
  const hasNote = Boolean(capture.note?.trim());
  const hasTags = taggings.some((tagging) => tagging.target_type === "capture" && tagging.target_id === capture.id);
  return !hasNote && !hasTags;
}

export function captureStats(captures: Capture[], attachments: Attachment[] = [], taggings: Tagging[] = []) {
  const attachmentCaptureIds = new Set(attachments.map((attachment) => attachment.capture_id).filter(Boolean));

  return {
    total: captures.length,
    links: captures.filter((capture) => capture.type === "link").length,
    screenshots: captures.filter((capture) => capture.type === "screenshot" || attachmentCaptureIds.has(capture.id)).length,
    notes: captures.filter((capture) => capture.type === "note").length,
    attachments: attachments.length,
    social: captures.filter(isSocialCapture).length,
    needsTriage: captures.filter((capture) => captureNeedsTriage(capture, taggings)).length
  };
}

export function captureSourceOptions(captures: Capture[]): CaptureSourceOption[] {
  const counts = new Map<string, number>();
  for (const capture of captures) {
    const source = captureSource(capture);
    if (!source) continue;
    counts.set(source, (counts.get(source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([source, count]) => ({ source, label: sourceLabel(source) ?? source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function captureCollections(captures: Capture[], tags: Tag[] = [], taggings: Tagging[] = [], limit = 10): CaptureCollection[] {
  if (limit <= 0) return [];

  const captureIds = new Set(captures.map((capture) => capture.id));
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const captureIdsByTag = new Map<string, Set<string>>();

  for (const tagging of taggings) {
    if (tagging.target_type !== "capture" || !captureIds.has(tagging.target_id) || !tagsById.has(tagging.tag_id)) continue;
    const captureSet = captureIdsByTag.get(tagging.tag_id) ?? new Set<string>();
    captureSet.add(tagging.target_id);
    captureIdsByTag.set(tagging.tag_id, captureSet);
  }

  const sourceCollections = captureSourceOptions(captures).map<CaptureCollection>((option) => ({
    id: `source:${option.source}`,
    kind: "source",
    value: option.source,
    label: option.label,
    count: option.count
  }));

  const tagCollections = [...captureIdsByTag.entries()].flatMap<CaptureCollection>(([tagId, captureSet]) => {
    const tag = tagsById.get(tagId);
    if (!tag) return [];
    return [
      {
        id: `tag:${tag.id}`,
        kind: "tag" as const,
        value: tag.id,
        label: tag.name,
        count: captureSet.size
      }
    ];
  });

  return [...sourceCollections, ...tagCollections]
    .sort((a, b) => b.count - a.count || collectionKindRank(a.kind) - collectionKindRank(b.kind) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function collectionKindRank(kind: CaptureCollection["kind"]) {
  return kind === "source" ? 0 : 1;
}

export function attachmentsForCapture(attachments: Attachment[], captureId: string) {
  return attachments.filter((attachment) => attachment.capture_id === captureId);
}

export function captureSearchFields(capture: Capture, attachments: Attachment[] = []) {
  return uniqueSearchValues([
    capture.title,
    capture.note,
    capture.url,
    capture.source,
    captureSource(capture),
    captureSourceLabel(capture),
    capture.type,
    ...sourceAliases(captureSource(capture)),
    ...attachmentsForCapture(attachments, capture.id).map((attachment) => attachment.filename)
  ]);
}

export function captureMatchesType(capture: Capture, type: CaptureFilter, attachments: Attachment[] = [], taggings: Tagging[] = []) {
  if (type === "all") return true;
  if (type === "social") return isSocialCapture(capture);
  if (type === "needs-triage") return captureNeedsTriage(capture, taggings);
  if (type === "screenshot") return capture.type === "screenshot" || attachmentsForCapture(attachments, capture.id).length > 0;
  return capture.type === type;
}
