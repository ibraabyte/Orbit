import type { OfflineCaptureDraft } from "@/lib/offline-queue";
import { CAPTURE_IMAGE_LIMIT_DETAIL, CAPTURE_MAX_IMAGE_FILE_BYTES, CAPTURE_MAX_IMAGE_FILES, CAPTURE_MAX_TOTAL_IMAGE_BYTES } from "@/lib/capture-files";
import type { CaptureType } from "@/lib/types";

export type OfflineQueueExportFile = {
  draftId: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  dataBase64: string;
};

export type OfflineQueueExportCapture = Omit<OfflineCaptureDraft, "files"> & {
  files: Array<{
    filename: string;
    contentType: string | null;
    sizeBytes: number;
  }>;
};

export type OfflineQueueExportPayload = {
  exportedAt: string;
  userId: string;
  version: 1;
  scope: "offline-capture-queue";
  summary: {
    captures: number;
    files: number;
  };
  captures: OfflineQueueExportCapture[];
  files: {
    captures: OfflineQueueExportFile[];
  };
};

export type OfflineQueueImportOptions = {
  userId?: string;
};

const validCaptureTypes = new Set<CaptureType>(["link", "screenshot", "note"]);

export async function buildOfflineQueueExportPayload(
  userId: string,
  drafts: OfflineCaptureDraft[],
  exportedAt = new Date().toISOString()
): Promise<OfflineQueueExportPayload> {
  const files: OfflineQueueExportFile[] = [];
  const captures: OfflineQueueExportCapture[] = [];

  for (const draft of drafts) {
    const draftFiles = draft.files ?? [];
    captures.push({
      id: draft.id,
      type: draft.type,
      title: draft.title,
      url: draft.url,
      note: draft.note,
      tag_names: draft.tag_names,
      created_at: draft.created_at,
      files: draftFiles.map(fileMetadata)
    });

    for (const file of draftFiles) {
      files.push({
        draftId: draft.id,
        ...fileMetadata(file),
        dataBase64: arrayBufferToBase64(await blobToArrayBuffer(file))
      });
    }
  }

  return {
    exportedAt,
    userId,
    version: 1,
    scope: "offline-capture-queue",
    summary: {
      captures: drafts.length,
      files: files.length
    },
    captures,
    files: {
      captures: files
    }
  };
}

export function parseOfflineQueueExportPayload(input: unknown, options: OfflineQueueImportOptions = {}): OfflineCaptureDraft[] {
  const payload = assertOfflineQueuePayload(input);

  if (options.userId && payload.userId !== options.userId) {
    throw new Error("This offline queue rescue copy belongs to a different Orbit account.");
  }

  const captureIds = new Set(payload.captures.map((capture) => capture.id));
  const filesByDraft = new Map<string, OfflineQueueExportFile[]>();

  if (payload.summary.captures !== payload.captures.length || payload.summary.files !== payload.files.captures.length) {
    throw new Error("Offline queue rescue copy has an invalid summary.");
  }

  for (const file of payload.files.captures) {
    if (!captureIds.has(file.draftId)) {
      throw new Error("Offline queue export references an unknown capture.");
    }

    assertExportFilePayload(file);
    const files = filesByDraft.get(file.draftId) ?? [];
    files.push(file);
    filesByDraft.set(file.draftId, files);
  }

  validateCaptureFileGroups(payload.captures, filesByDraft);

  return payload.captures.map<OfflineCaptureDraft>((capture) => ({
    id: capture.id,
    type: capture.type,
    title: capture.title,
    url: capture.url,
    note: capture.note,
    tag_names: capture.tag_names,
    created_at: capture.created_at,
    files: (filesByDraft.get(capture.id) ?? []).map(fileFromExport)
  }));
}

function fileMetadata(file: File) {
  return {
    filename: file.name,
    contentType: file.type || null,
    sizeBytes: file.size
  };
}

function blobToArrayBuffer(blob: Blob) {
  const withArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === "function") return withArrayBuffer.arrayBuffer();
  if (typeof FileReader !== "undefined") return blobToArrayBufferWithReader(blob);
  return new Response(blob).arrayBuffer();
}

function blobToArrayBufferWithReader(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Queued file could not be read."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Queued file could not be read."));
    reader.readAsArrayBuffer(blob);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

function assertOfflineQueuePayload(input: unknown): OfflineQueueExportPayload {
  const payload = assertRecord(input, "Offline queue rescue copy could not be read.");

  if (payload.scope !== "offline-capture-queue" || payload.version !== 1) {
    throw new Error("Only offline queue rescue exports can be imported.");
  }

  const summary = assertRecord(payload.summary, "Offline queue rescue copy is missing its summary.");
  const files = assertRecord(payload.files, "Offline queue rescue copy is missing queued file data.");

  if (typeof payload.exportedAt !== "string" || typeof payload.userId !== "string") {
    throw new Error("Offline queue rescue copy is missing export metadata.");
  }

  if (typeof summary.captures !== "number" || typeof summary.files !== "number") {
    throw new Error("Offline queue rescue copy has an invalid summary.");
  }

  if (!Array.isArray(payload.captures) || !Array.isArray(files.captures)) {
    throw new Error("Offline queue rescue copy is missing queued captures.");
  }

  return {
    exportedAt: payload.exportedAt,
    userId: payload.userId,
    version: 1,
    scope: "offline-capture-queue",
    summary: {
      captures: summary.captures,
      files: summary.files
    },
    captures: payload.captures.map(assertExportCapture),
    files: {
      captures: files.captures.map(assertExportFile)
    }
  };
}

function assertExportCapture(input: unknown): OfflineQueueExportCapture {
  const capture = assertRecord(input, "Offline queue rescue copy contains an unreadable capture.");
  const type = capture.type;

  if (!isCaptureType(type)) {
    throw new Error("Offline queue rescue copy contains an unsupported capture type.");
  }

  return {
    id: requiredString(capture.id, "Offline queue rescue copy contains a capture without an id."),
    type,
    title: requiredString(capture.title, "Offline queue rescue copy contains a capture without a title."),
    url: nullableString(capture.url, "Offline queue rescue copy contains an invalid capture URL."),
    note: nullableString(capture.note, "Offline queue rescue copy contains an invalid capture note."),
    tag_names: stringArray(capture.tag_names, "Offline queue rescue copy contains invalid capture tags."),
    created_at: requiredString(capture.created_at, "Offline queue rescue copy contains a capture without a timestamp."),
    files: fileMetadataArray(capture.files)
  };
}

function assertExportFile(input: unknown): OfflineQueueExportFile {
  const file = assertRecord(input, "Offline queue rescue copy contains an unreadable file.");
  const sizeBytes = file.sizeBytes;

  if (typeof sizeBytes !== "number" || sizeBytes < 0 || !Number.isFinite(sizeBytes)) {
    throw new Error("Offline queue rescue copy contains an invalid file size.");
  }

  return {
    draftId: requiredString(file.draftId, "Offline queue rescue copy contains a file without a capture id."),
    filename: requiredString(file.filename, "Offline queue rescue copy contains a file without a name."),
    contentType: nullableString(file.contentType, "Offline queue rescue copy contains an invalid file type."),
    sizeBytes,
    dataBase64: requiredString(file.dataBase64, "Offline queue rescue copy contains unreadable file data.")
  };
}

function assertExportFilePayload(file: OfflineQueueExportFile) {
  if (!file.contentType?.startsWith("image/")) {
    throw new Error("Offline queue rescue copy contains unsupported file data.");
  }

  if (file.sizeBytes > CAPTURE_MAX_IMAGE_FILE_BYTES) {
    throw new Error(`"${file.filename || "Image"}" is over the 10 MB image limit. ${CAPTURE_IMAGE_LIMIT_DETAIL}`);
  }

  const decodedByteLength = base64DecodedByteLength(file.dataBase64);
  if (decodedByteLength === null) {
    throw new Error("Offline queue rescue copy contains unreadable file data.");
  }

  if (decodedByteLength !== file.sizeBytes) {
    throw new Error(`Queued file "${file.filename}" is corrupted.`);
  }
}

function validateCaptureFileGroups(captures: OfflineQueueExportCapture[], filesByDraft: Map<string, OfflineQueueExportFile[]>) {
  for (const capture of captures) {
    const files = filesByDraft.get(capture.id) ?? [];
    if (capture.files.length !== files.length) {
      throw new Error("Offline queue rescue copy contains invalid capture file metadata.");
    }

    if (files.length > CAPTURE_MAX_IMAGE_FILES) {
      throw new Error(CAPTURE_IMAGE_LIMIT_DETAIL);
    }

    if (files.reduce((total, file) => total + file.sizeBytes, 0) > CAPTURE_MAX_TOTAL_IMAGE_BYTES) {
      throw new Error(`Selected images exceed the 25 MB total image limit. ${CAPTURE_IMAGE_LIMIT_DETAIL}`);
    }
  }
}

function fileMetadataArray(value: unknown): OfflineQueueExportCapture["files"] {
  if (!Array.isArray(value)) {
    throw new Error("Offline queue rescue copy contains invalid capture file metadata.");
  }

  return value.map((item) => {
    const file = assertRecord(item, "Offline queue rescue copy contains invalid capture file metadata.");
    const sizeBytes = file.sizeBytes;

    if (typeof sizeBytes !== "number" || sizeBytes < 0 || !Number.isFinite(sizeBytes)) {
      throw new Error("Offline queue rescue copy contains invalid capture file metadata.");
    }

    return {
      filename: requiredString(file.filename, "Offline queue rescue copy contains invalid capture file metadata."),
      contentType: nullableString(file.contentType, "Offline queue rescue copy contains invalid capture file metadata."),
      sizeBytes
    };
  });
}

function fileFromExport(file: OfflineQueueExportFile): File {
  if (typeof File === "undefined") {
    throw new Error("This browser cannot restore queued files.");
  }

  const blob = base64ToBlob(file.dataBase64, file.contentType);
  if (blob.size !== file.sizeBytes) {
    throw new Error(`Queued file "${file.filename}" is corrupted.`);
  }

  return new File([blob], file.filename, { type: file.contentType ?? "" });
}

function base64DecodedByteLength(value: string) {
  const normalized = value.trim();
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return (normalized.length / 4) * 3 - padding;
}

function base64ToBlob(base64: string, contentType: string | null): Blob {
  let binary = "";

  try {
    binary = atob(base64);
  } catch {
    throw new Error("Offline queue rescue copy contains unreadable file data.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType ?? "application/octet-stream" });
}

function assertRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function isCaptureType(value: unknown): value is CaptureType {
  return typeof value === "string" && validCaptureTypes.has(value as CaptureType);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function nullableString(value: unknown, message: string): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error(message);
}

function stringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(message);
  }

  return value;
}
