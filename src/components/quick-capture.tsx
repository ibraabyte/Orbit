"use client";

import { ClipboardEvent, DragEvent, FormEvent, useState } from "react";
import { BookmarkPlus, Camera, Link as LinkIcon, Loader2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { CAPTURE_IMAGE_LIMIT_DETAIL, imageFiles, imageFilesFromItems, selectCaptureImageFiles } from "@/lib/capture-files";
import { saveOnlineCapture } from "@/lib/capture-save";
import type { CaptureType } from "@/lib/types";
import { queueOfflineCapture } from "@/lib/offline-queue";
import { parseTagInput } from "@/lib/tag-actions";

const CAPTURE_TYPES: { value: CaptureType; label: React.ReactNode }[] = [
  {
    value: "link",
    label: (
      <span className="inline-flex items-center gap-1">
        <LinkIcon size={14} aria-hidden="true" />
        Link
      </span>
    )
  },
  {
    value: "note",
    label: (
      <span className="inline-flex items-center gap-1">
        <StickyNote size={14} aria-hidden="true" />
        Note
      </span>
    )
  },
  {
    value: "screenshot",
    label: (
      <span className="inline-flex items-center gap-1">
        <Camera size={14} aria-hidden="true" />
        Screenshot
      </span>
    )
  }
];

export function QuickCapture({
  userId,
  onSaved,
  initialType = "link",
  initialTitle = "",
  initialUrl = "",
  initialNote = "",
  initialTags = "",
  initialFile = null,
  initialFiles = []
}: {
  userId: string;
  onSaved: () => Promise<void> | void;
  initialType?: CaptureType;
  initialTitle?: string;
  initialUrl?: string;
  initialNote?: string;
  initialTags?: string;
  initialFile?: File | null;
  initialFiles?: File[];
}) {
  const seededFiles = initialFiles.length ? initialFiles : initialFile ? [initialFile] : [];
  const [type, setType] = useState<CaptureType>(seededFiles.length ? "screenshot" : initialType);
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const [note, setNote] = useState(initialNote);
  const [tagInput, setTagInput] = useState(initialTags);
  const [files, setFiles] = useState<File[]>(seededFiles);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const cleanedUrl = url.trim() || null;
    const cleanedTitle = title.trim() || cleanedUrl || captureTitleFromFiles(files) || "Untitled capture";

    if (!navigator.onLine) {
      try {
        await queueOfflineCapture({
          type,
          title: cleanedTitle,
          url: cleanedUrl,
          note: note.trim() || null,
          tag_names: parseTagInput(tagInput),
          files
        });
        reset();
        setMessage(offlineCaptureMessage(files.length));
      } catch (captureError) {
        setError(captureError instanceof Error ? captureError.message : "Capture could not be saved offline.");
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      await saveOnlineCapture({
        userId,
        type,
        title: cleanedTitle,
        url: cleanedUrl,
        note: note.trim() || null,
        tagNames: parseTagInput(tagInput),
        files
      });
      reset();
      setMessage("Captured.");
      await onSaved();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Capture could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setTitle("");
    setUrl("");
    setNote("");
    setTagInput("");
    setFiles([]);
  }

  function attachImages(nextFiles: File[], source: "Pasted" | "Dropped" | "Selected") {
    if (!nextFiles.length) return;
    try {
      const selection = selectCaptureImageFiles(nextFiles);
      if (!selection.files.length) return;
      setType("screenshot");
      setFiles(selection.files);
      setError(null);
      setMessage(attachmentMessage(source, selection.files, selection.ignoredCount));
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Images could not be attached.");
      setMessage(null);
    }
  }

  function changeType(nextType: CaptureType) {
    setType(nextType);
    if (nextType !== "screenshot") {
      setFiles([]);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLFormElement>) {
    const pastedFiles = imageFilesFromItems(event.clipboardData.items);
    const nextFiles = pastedFiles.length ? pastedFiles : imageFiles(event.clipboardData.files);
    if (!nextFiles.length) return;
    event.preventDefault();
    attachImages(nextFiles, "Pasted");
  }

  function onDragOver(event: DragEvent<HTMLFormElement>) {
    if (![...imageFilesFromItems(event.dataTransfer.items), ...imageFiles(event.dataTransfer.files)].length) return;
    event.preventDefault();
    setDragActive(true);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    const itemFiles = imageFilesFromItems(event.dataTransfer.items);
    const droppedFiles = itemFiles.length ? itemFiles : imageFiles(event.dataTransfer.files);
    setDragActive(false);
    if (!droppedFiles.length) return;
    event.preventDefault();
    attachImages(droppedFiles, "Dropped");
  }

  return (
    <form
      className={`flex flex-col gap-3 rounded-tile ${dragActive ? "ring-2 ring-accent-deep ring-offset-2 ring-offset-surface" : ""}`}
      onSubmit={onSubmit}
      onPaste={onPaste}
      onDragOver={onDragOver}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
    >
      <Segmented ariaLabel="Capture type" size="sm" options={CAPTURE_TYPES} value={type} onChange={changeType} />

      <Field label="Title" htmlFor="capture-title">
        <Input id="capture-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Video idea, article, receipt, workout note..." />
      </Field>

      <Field label="URL" htmlFor="capture-url">
        <Input id="capture-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
      </Field>

      <Field label="Note" htmlFor="capture-note">
        <Textarea id="capture-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why this matters, what to do next, or context you want to remember." />
      </Field>

      <Field label="Tags" htmlFor="capture-tags">
        <Input id="capture-tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="fitness, research, idea" />
      </Field>

      {type === "screenshot" ? (
        <Field label="Screenshot" htmlFor="capture-file">
          <Input
            id="capture-file"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const selectedFiles = imageFiles(event.target.files);
              if (selectedFiles.length) attachImages(selectedFiles, "Selected");
            }}
          />
          <p className="mt-1 text-[12px] text-ink-muted">{CAPTURE_IMAGE_LIMIT_DETAIL}</p>
          {files.length ? <p className="text-[12px] text-ink-muted">{fileSummary(files)}</p> : null}
        </Field>
      ) : null}

      {error ? <div className="text-[13px] font-semibold text-urgent" role="alert">{error}</div> : null}
      {message ? <div className="text-[13px] font-semibold text-emerald-4" role="status">{message}</div> : null}

      <Button variant="primary" type="submit" disabled={saving} className="self-start">
        {saving ? <Loader2 size={16} aria-hidden="true" /> : <BookmarkPlus size={16} aria-hidden="true" />}
        Save capture
      </Button>
    </form>
  );
}

function captureTitleFromFiles(files: File[]) {
  if (!files.length) return "";
  if (files.length === 1) return files[0].name;
  return `${files.length} screenshots`;
}

function fileSummary(files: File[]) {
  if (files.length <= 2) return files.map((file) => file.name).join(", ");
  return `${files.length} images: ${files.slice(0, 2).map((file) => file.name).join(", ")}...`;
}

function attachmentMessage(source: "Pasted" | "Dropped" | "Selected", files: File[], ignoredCount: number) {
  const attached = files.length === 1 ? `${source} ${files[0].name}.` : `${source} ${files.length} images.`;
  if (!ignoredCount) return attached;
  return `${attached} ${ignoredCount} extra image${ignoredCount === 1 ? "" : "s"} ignored.`;
}

function offlineCaptureMessage(fileCount: number) {
  if (!fileCount) return "Saved offline. Orbit will sync it when you are back online.";
  return `Saved offline with ${fileCount} image${fileCount === 1 ? "" : "s"}. Orbit will upload it when you are back online.`;
}
