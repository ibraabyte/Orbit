import { describe, expect, it } from "vitest";
import { CAPTURE_MAX_IMAGE_FILE_BYTES } from "@/lib/capture-files";
import { buildOfflineQueueExportPayload, parseOfflineQueueExportPayload } from "@/lib/offline-queue-export";
import type { OfflineCaptureDraft } from "@/lib/offline-queue";

const baseDraft: OfflineCaptureDraft = {
  id: "offline-1",
  type: "link",
  title: "Read later",
  url: "https://example.com/article",
  note: "Useful",
  tag_names: ["research"],
  created_at: "2026-07-01T10:00:00.000Z"
};

describe("offline queue export", () => {
  it("builds a rescue export payload for queued captures", async () => {
    await expect(buildOfflineQueueExportPayload("user-1", [baseDraft], "2026-07-01T11:00:00.000Z")).resolves.toMatchObject({
      exportedAt: "2026-07-01T11:00:00.000Z",
      userId: "user-1",
      version: 1,
      scope: "offline-capture-queue",
      summary: { captures: 1, files: 0 },
      captures: [
        {
          id: "offline-1",
          type: "link",
          title: "Read later",
          url: "https://example.com/article",
          note: "Useful",
          tag_names: ["research"],
          created_at: "2026-07-01T10:00:00.000Z",
          files: []
        }
      ],
      files: { captures: [] }
    });
  });

  it("embeds queued screenshot files as base64", async () => {
    const file = new File(["receipt"], "receipt.png", { type: "image/png" });
    const payload = await buildOfflineQueueExportPayload(
      "user-1",
      [
        {
          ...baseDraft,
          type: "screenshot",
          title: "Receipt",
          url: null,
          files: [file]
        }
      ],
      "2026-07-01T11:00:00.000Z"
    );

    expect(payload.summary).toEqual({ captures: 1, files: 1 });
    expect(payload.captures[0].files).toEqual([{ filename: "receipt.png", contentType: "image/png", sizeBytes: 7 }]);
    expect(payload.files.captures).toEqual([
      {
        draftId: "offline-1",
        filename: "receipt.png",
        contentType: "image/png",
        sizeBytes: 7,
        dataBase64: "cmVjZWlwdA=="
      }
    ]);
  });

  it("parses a rescue export payload back into queued drafts", async () => {
    const file = new File(["receipt"], "receipt.png", { type: "image/png" });
    const payload = await buildOfflineQueueExportPayload(
      "user-1",
      [
        {
          ...baseDraft,
          type: "screenshot",
          title: "Receipt",
          url: null,
          files: [file]
        }
      ],
      "2026-07-01T11:00:00.000Z"
    );

    const [draft] = parseOfflineQueueExportPayload(payload, { userId: "user-1" });

    expect(draft).toMatchObject({
      id: "offline-1",
      type: "screenshot",
      title: "Receipt",
      url: null,
      note: "Useful",
      tag_names: ["research"],
      created_at: "2026-07-01T10:00:00.000Z"
    });
    expect(draft.files).toHaveLength(1);
    expect(draft.files?.[0]).toBeInstanceOf(File);
    expect(draft.files?.[0].name).toBe("receipt.png");
    expect(draft.files?.[0].type).toBe("image/png");
    await expect(readFileText(draft.files?.[0] as File)).resolves.toBe("receipt");
  });

  it("rejects rescue exports from a different account", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [baseDraft]);

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-2" })).toThrow("different Orbit account");
  });

  it("rejects non-queue rescue files", () => {
    expect(() => parseOfflineQueueExportPayload({ version: 1, scope: "orbit-backup" })).toThrow("Only offline queue rescue exports");
  });

  it("rejects file payloads that point at missing captures", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files: [new File(["receipt"], "receipt.png", { type: "image/png" })] }]);
    payload.files.captures[0].draftId = "missing";

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("unknown capture");
  });

  it("rejects rescue exports with mismatched summary counts", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [baseDraft]);
    payload.summary.captures = 2;

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("invalid summary");
  });

  it("rejects rescue exports with missing embedded file metadata", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files: [new File(["receipt"], "receipt.png", { type: "image/png" })] }]);
    payload.captures[0].files = [];

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("invalid capture file metadata");
  });

  it("rejects unsupported queued file types before restore", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files: [new File(["note"], "note.txt", { type: "text/plain" })] }]);

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("unsupported file data");
  });

  it("rejects oversized queued files before restore", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files: [new File(["receipt"], "receipt.png", { type: "image/png" })] }]);
    payload.files.captures[0].sizeBytes = CAPTURE_MAX_IMAGE_FILE_BYTES + 1;

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("over the 10 MB image limit");
  });

  it("rejects too many queued files for one capture before restore", async () => {
    const files = Array.from({ length: 6 }, (_, index) => new File([`image-${index}`], `image-${index}.png`, { type: "image/png" }));
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files }]);

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow("Capture images are limited");
  });

  it("rejects corrupted queued file data before restore", async () => {
    const payload = await buildOfflineQueueExportPayload("user-1", [{ ...baseDraft, files: [new File(["receipt"], "receipt.png", { type: "image/png" })] }]);
    payload.files.captures[0].sizeBytes += 1;

    expect(() => parseOfflineQueueExportPayload(payload, { userId: "user-1" })).toThrow('Queued file "receipt.png" is corrupted.');
  });
});

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsText(file);
  });
}
