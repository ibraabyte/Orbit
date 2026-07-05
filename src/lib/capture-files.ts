export type ClipboardFileItem = {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
};

type AttachmentFileLike = Pick<File, "name" | "type">;
type CaptureImageFileLike = Pick<File, "name" | "size" | "type">;

export const CAPTURE_MAX_IMAGE_FILES = 5;
export const CAPTURE_MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
export const CAPTURE_MAX_TOTAL_IMAGE_BYTES = 25 * 1024 * 1024;
export const CAPTURE_IMAGE_LIMIT_DETAIL = "Capture images are limited to 5 files, 10 MB each, and 25 MB total.";

const imageExtensionByType: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function isImageFile(file: Pick<File, "type"> | null | undefined) {
  return Boolean(file?.type?.startsWith("image/"));
}

export function firstImageFile(files: ArrayLike<File> | null | undefined) {
  return imageFiles(files)[0] ?? null;
}

export function imageFiles(files: ArrayLike<File> | null | undefined) {
  if (!files) return [];
  const images: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (isImageFile(file)) images.push(file);
  }
  return images;
}

export function firstImageFileFromItems(items: ArrayLike<ClipboardFileItem> | null | undefined) {
  return imageFilesFromItems(items)[0] ?? null;
}

export function imageFilesFromItems(items: ArrayLike<ClipboardFileItem> | null | undefined) {
  if (!items) return [];
  const files: File[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind && item.kind !== "file") continue;
    if (!item.type?.startsWith("image/")) continue;
    const file = item.getAsFile?.() ?? null;
    if (file && isImageFile(file)) files.push(file);
  }
  return files;
}

export function selectCaptureImageFiles(files: File[]) {
  const images = files.filter(isImageFile);
  const selected = images.slice(0, CAPTURE_MAX_IMAGE_FILES);
  assertCaptureImageFilesWithinLimits(selected);

  return {
    files: selected,
    ignoredCount: Math.max(0, images.length - selected.length)
  };
}

export function assertCaptureImageFilesWithinLimits<T extends CaptureImageFileLike>(files: T[]) {
  if (files.length > CAPTURE_MAX_IMAGE_FILES) {
    throw new Error(CAPTURE_IMAGE_LIMIT_DETAIL);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!isImageFile(file)) continue;
    const size = typeof file.size === "number" ? file.size : 0;

    if (size > CAPTURE_MAX_IMAGE_FILE_BYTES) {
      throw new Error(`"${file.name || "Image"}" is over the 10 MB image limit. ${CAPTURE_IMAGE_LIMIT_DETAIL}`);
    }

    if (totalBytes + size > CAPTURE_MAX_TOTAL_IMAGE_BYTES) {
      throw new Error(`Selected images exceed the 25 MB total image limit. ${CAPTURE_IMAGE_LIMIT_DETAIL}`);
    }

    totalBytes += size;
  }

  return files;
}

export function safeAttachmentFilename(file: AttachmentFileLike, fallbackBase = "attachment") {
  const rawName = file.name.split(/[/\\]/).pop()?.trim() ?? "";
  const nameExtension = safeNameExtension(rawName);
  const extension = nameExtension ?? imageExtensionByType[file.type] ?? "";
  const base = nameExtension ? rawName.slice(0, -(nameExtension.length + 1)) : rawName;
  const fallback = sanitizeFilenamePart(fallbackBase) || "attachment";
  const maxBaseLength = extension ? 139 - extension.length : 140;
  const safeBase = (sanitizeFilenamePart(base) || fallback).slice(0, maxBaseLength);
  return extension ? `${safeBase}.${extension}` : safeBase;
}

export function attachmentObjectPath(userId: string, captureId: string, file: AttachmentFileLike, timestamp = Date.now()) {
  return `${userId}/${captureId}/${timestamp}-${safeAttachmentFilename(file)}`;
}

function safeNameExtension(name: string) {
  return name.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase() ?? null;
}

function sanitizeFilenamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-_]+|[.\-_]+$/g, "");
}
