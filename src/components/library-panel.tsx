"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Bell, Camera, ClipboardCheck, Copy, ExternalLink, FileImage, Link as LinkIcon, Loader2, Search, Share2, StickyNote, Tags, Trash2 } from "lucide-react";
import { EmptyState, ModuleCard } from "@/components/module-card";
import { QuickCapture } from "@/components/quick-capture";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/form";
import { StatTile } from "@/components/ui/stat-tile";
import { getSupabase } from "@/lib/supabase";
import { formatShortDate, formatTime } from "@/lib/dates";
import { createReminderFromCapture, createTaskFromCapture } from "@/lib/capture-actions";
import { attachmentsForCapture, captureCollections, captureMatchesType, captureNeedsTriage, captureSearchFields, captureSource, captureSourceLabel, captureSourceOptions, captureStats, type CaptureCollection, type CaptureFilter } from "@/lib/library";
import { tagsForTarget, targetMatchesTag, textMatchesQuery } from "@/lib/tag-actions";
import type { Attachment, Capture, Tag, Tagging } from "@/lib/types";

const TYPE_FILTERS: { value: CaptureFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "social", label: "Social" },
  { value: "needs-triage", label: "Unsorted" },
  { value: "link", label: "Links" },
  { value: "screenshot", label: "Screenshots" },
  { value: "note", label: "Notes" }
];

export function LibraryPanel({
  userId,
  captures,
  attachments = [],
  tags = [],
  taggings = [],
  onChanged,
  compact = false
}: {
  userId: string;
  captures: Capture[];
  attachments?: Attachment[];
  tags?: Tag[];
  taggings?: Tagging[];
  onChanged: () => Promise<void> | void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CaptureFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const stats = useMemo(() => captureStats(captures, attachments, taggings), [attachments, captures, taggings]);
  const sourceOptions = useMemo(() => captureSourceOptions(captures), [captures]);
  const collections = useMemo(() => captureCollections(captures, tags, taggings), [captures, tags, taggings]);
  const activeCollectionId = tagId ? `tag:${tagId}` : sourceFilter ? `source:${sourceFilter}` : null;
  const visibleCaptures = useMemo(
    () =>
      captures.filter(
        (capture) =>
          textMatchesQuery(query, captureSearchFields(capture, attachments)) &&
          captureMatchesType(capture, typeFilter, attachments, taggings) &&
          (!sourceFilter || captureSource(capture) === sourceFilter) &&
          targetMatchesTag(taggings, tagId, "capture", capture.id)
      ),
    [attachments, captures, query, sourceFilter, tagId, taggings, typeFilter]
  );

  function toggleCollection(collection: CaptureCollection) {
    if (activeCollectionId === collection.id) {
      if (collection.kind === "tag") setTagId(null);
      if (collection.kind === "source") setSourceFilter(null);
      return;
    }

    if (collection.kind === "tag") {
      setTagId(collection.value);
      setSourceFilter(null);
      return;
    }

    setSourceFilter(collection.value);
    setTagId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ModuleCard title="Quick capture" kicker="Paste links, notes, or upload screenshots.">
        <QuickCapture userId={userId} onSaved={onChanged} />
      </ModuleCard>
      <ModuleCard title="Recent saves" kicker={`${captures.length} saved items loaded`}>
        {!compact ? (
          <div className="mb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <CaptureStat icon={<LinkIcon size={16} />} label="Links" value={stats.links} />
              <CaptureStat icon={<Camera size={16} />} label="Screenshots" value={stats.screenshots} />
              <CaptureStat icon={<StickyNote size={16} />} label="Notes" value={stats.notes} />
              <CaptureStat icon={<Share2 size={16} />} label="Social" value={stats.social} />
              <CaptureStat icon={<Tags size={16} />} label="Unsorted" value={stats.needsTriage} />
            </div>
            {collections.length ? (
              <div className="flex flex-wrap gap-2" aria-label="Capture collections">
                {collections.map((collection) => (
                  <Chip
                    key={collection.id}
                    active={activeCollectionId === collection.id}
                    onClick={() => toggleCollection(collection)}
                    count={collection.count}
                  >
                    {collection.kind === "tag" ? `#${collection.label}` : collection.label}
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search links, notes, sources, files..." aria-label="Search captures" className="pl-9" />
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Capture type filter">
                {TYPE_FILTERS.map((filter) => (
                  <Chip key={filter.value} active={typeFilter === filter.value} onClick={() => setTypeFilter(filter.value)}>
                    {filter.label}
                  </Chip>
                ))}
              </div>
              <Select value={sourceFilter ?? ""} onChange={(event) => setSourceFilter(event.target.value || null)} aria-label="Filter by source">
                <option value="">All sources</option>
                {sourceOptions.map((option) => (
                  <option key={option.source} value={option.source}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </Select>
              <Select value={tagId ?? ""} onChange={(event) => setTagId(event.target.value || null)} aria-label="Filter by tag">
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    #{tag.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
        <CaptureList userId={userId} captures={compact ? visibleCaptures.slice(0, 5) : visibleCaptures} attachments={attachments} tags={tags} taggings={taggings} onChanged={onChanged} />
      </ModuleCard>
    </div>
  );
}

function CaptureList({
  userId,
  captures,
  attachments,
  tags,
  taggings,
  onChanged
}: {
  userId: string;
  captures: Capture[];
  attachments: Attachment[];
  tags: Tag[];
  taggings: Tagging[];
  onChanged: () => Promise<void> | void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [taskingId, setTaskingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!captures.length) return <EmptyState>No saved links or screenshots yet.</EmptyState>;

  async function remove(capture: Capture) {
    const supabase = getSupabase();
    setActionError(null);
    setDeletingId(capture.id);

    try {
      const files = attachmentsForCapture(attachments, capture.id);
      if (files.length) {
        const { error } = await supabase.storage.from("orbit-attachments").remove(files.map((file) => file.object_path));
        if (error) throw new Error(error.message);
      }

      const { error } = await supabase.from("captures").delete().eq("id", capture.id).eq("user_id", capture.user_id);
      if (error) throw new Error(error.message);

      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Capture could not be deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  async function openAttachment(attachment: Attachment) {
    const { data, error } = await getSupabase().storage.from(attachment.bucket).createSignedUrl(attachment.object_path, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function copyUrl(capture: Capture) {
    if (!capture.url || !navigator.clipboard) return;
    await navigator.clipboard.writeText(capture.url);
    setCopiedId(capture.id);
    window.setTimeout(() => setCopiedId((current) => (current === capture.id ? null : current)), 1200);
  }

  async function createFollowUpTask(capture: Capture) {
    setActionError(null);
    setTaskingId(capture.id);

    try {
      await createTaskFromCapture(userId, capture, attachmentsForCapture(attachments, capture.id));
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Task could not be created from capture.");
    } finally {
      setTaskingId(null);
    }
  }

  async function createFollowUpReminder(capture: Capture) {
    setActionError(null);
    setRemindingId(capture.id);

    try {
      await createReminderFromCapture(userId, capture, attachmentsForCapture(attachments, capture.id));
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Reminder could not be created from capture.");
    } finally {
      setRemindingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {actionError ? (
        <div className="text-[13px] font-semibold text-urgent" role="alert">
          {actionError}
        </div>
      ) : null}
      {captures.map((capture) => {
        const files = attachmentsForCapture(attachments, capture.id);
        const captureTags = tagsForTarget(tags, taggings, "capture", capture.id);
        const needsTriage = captureNeedsTriage(capture, taggings);
        const busy = taskingId === capture.id || remindingId === capture.id || deletingId === capture.id;

        return (
          <div className="rounded-tile border border-hairline bg-surface p-3" key={capture.id}>
            <p className="text-[14px] font-semibold text-ink">{capture.title}</p>
            <p className="text-[12.5px] text-ink-muted">
              {captureSourceLabel(capture)} · {formatShortDate(capture.created_at)} {formatTime(capture.created_at)}
              {capture.note ? ` · ${capture.note}` : ""}
            </p>
            {files.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {files.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => openAttachment(file)}
                    className="inline-flex items-center gap-1 rounded-pill bg-surface-inset px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep"
                  >
                    <FileImage size={13} aria-hidden="true" />
                    {file.filename}
                  </button>
                ))}
              </div>
            ) : null}
            {captureTags.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {captureTags.map((tag) => (
                  <Badge key={tag.id}>#{tag.name}</Badge>
                ))}
              </div>
            ) : null}
            {needsTriage ? (
              <div className="mt-1.5">
                <Badge tone="warning">needs note or tag</Badge>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" type="button" onClick={() => createFollowUpTask(capture)} disabled={busy} aria-label="Create task from capture" title="Create task">
                {taskingId === capture.id ? <Loader2 size={16} aria-hidden="true" /> : <ClipboardCheck size={16} aria-hidden="true" />}
              </Button>
              <Button variant="secondary" size="sm" type="button" onClick={() => createFollowUpReminder(capture)} disabled={busy} aria-label="Create reminder from capture" title="Remind tomorrow">
                {remindingId === capture.id ? <Loader2 size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
              </Button>
              {capture.url ? (
                <>
                  <Button variant="secondary" size="sm" type="button" onClick={() => copyUrl(capture)} aria-label={copiedId === capture.id ? "Copied capture link" : "Copy capture link"} title={copiedId === capture.id ? "Copied" : "Copy link"}>
                    <Copy size={16} aria-hidden="true" />
                  </Button>
                  <ButtonLink variant="secondary" size="sm" href={capture.url} target="_blank" rel="noreferrer" aria-label="Open capture">
                    <ExternalLink size={16} aria-hidden="true" />
                  </ButtonLink>
                </>
              ) : null}
              <Button variant="secondary" size="sm" type="button" onClick={() => remove(capture)} disabled={deletingId === capture.id} aria-label="Delete capture">
                {deletingId === capture.id ? <Loader2 size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CaptureStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return <StatTile icon={icon} label={label} value={value} />;
}
