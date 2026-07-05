import type { CaptureType } from "@/lib/types";

const SHARED_TITLE_MAX_LENGTH = 280;
const SHARED_TEXT_MAX_LENGTH = 10000;
const SHARED_URL_MAX_LENGTH = 2048;

export type SharedCaptureInput = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  fileName?: string | null;
  fileNames?: string[];
};

export type SharedCaptureDraft = {
  type: CaptureType;
  title: string;
  url: string;
  note: string;
  tags: string;
};

export function normalizeSharedCapture(input: SharedCaptureInput): SharedCaptureDraft {
  const title = clampText((input.title ?? "").trim(), SHARED_TITLE_MAX_LENGTH);
  const text = clampText((input.text ?? "").trim(), SHARED_TEXT_MAX_LENGTH);
  const explicitUrl = clampText((input.url ?? "").trim(), SHARED_URL_MAX_LENGTH);
  const fileNames = [...(input.fileNames ?? []), input.fileName ?? ""].map((name) => name.trim()).filter(Boolean);
  const fileName = fileNames[0] ?? "";
  const textUrl = extractFirstUrl(text);
  const url = clampText(explicitUrl || textUrl || "", SHARED_URL_MAX_LENGTH);
  const note = textUrl ? text.replace(textUrl, "").trim() : text;
  const type = url ? "link" : fileName ? "screenshot" : "note";
  const fileTitle = fileNames.length > 1 ? `${fileNames.length} shared screenshots` : fileName;

  return {
    type,
    title: clampText(title || url || note.slice(0, 80) || fileTitle || "Shared to Orbit", SHARED_TITLE_MAX_LENGTH),
    url,
    note,
    tags: type === "screenshot" ? "shared, screenshot" : "shared"
  };
}

export function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s]+/i)?.[0] ?? "";
}

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
