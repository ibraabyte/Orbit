import { describe, expect, it } from "vitest";
import { CAPTURE_MAX_IMAGE_FILE_BYTES } from "@/lib/capture-files";
import { prepareQueuedCaptureRestore, syncQueuedCaptureDraft, type OfflineCaptureDraft } from "@/lib/offline-queue";

type Operation = {
  table: string;
  action: "insert" | "select" | "upsert" | "delete";
  payload?: unknown;
};

type StorageOperation = {
  action: "upload" | "remove";
  path?: string;
  paths?: string[];
  contentType?: string;
};

const draft: OfflineCaptureDraft = {
  id: "offline-1",
  type: "link",
  title: "Read later",
  url: "https://example.com/article",
  note: "Useful",
  tag_names: ["research"],
  created_at: "2026-07-01T10:00:00.000Z"
};

function mockOfflineClient(options: { failTagging?: boolean; failCapture?: boolean } = {}) {
  const operations: Operation[] = [];
  const storageOperations: StorageOperation[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async eq() {
              operations.push({ table, action: "select" });
              return { data: [], error: null };
            }
          };
        },
        insert(payload: Record<string, unknown>) {
          operations.push({ table, action: "insert", payload });
          return {
            select() {
              return {
                async single() {
                  if (options.failCapture && table === "captures") return { data: null, error: { message: "capture denied" } };
                  return {
                    data: { ...payload, id: `${table}-1`, created_at: payload.created_at ?? "2026-07-01T00:00:00.000Z" },
                    error: null
                  };
                }
              };
            }
          };
        },
        async upsert(payload: Record<string, unknown>[]) {
          operations.push({ table, action: "upsert", payload });
          return { error: options.failTagging ? { message: "tagging denied" } : null };
        },
        delete() {
          operations.push({ table, action: "delete" });
          return {
            eq() {
              return this;
            }
          };
        }
      };
    },
    storage: {
      from() {
        return {
          async upload(path: string, _file: File, uploadOptions: { contentType?: string }) {
            storageOperations.push({ action: "upload", path, contentType: uploadOptions.contentType });
            return { error: null };
          },
          async remove(paths: string[]) {
            storageOperations.push({ action: "remove", paths });
            return { error: null };
          }
        };
      }
    }
  };

  return { client, operations, storageOperations };
}

describe("offline capture queue", () => {
  it("preserves existing queued captures when a rescue import has duplicate ids", () => {
    const restored = prepareQueuedCaptureRestore(
      [
        { ...draft, id: "offline-1", title: "Imported duplicate" },
        { ...draft, id: "offline-2", title: "Imported unique" }
      ],
      [{ ...draft, id: "offline-1", title: "Already queued" }],
      idGenerator(["offline-3"])
    );

    expect(restored.renamedCount).toBe(1);
    expect(restored.drafts.map((item) => [item.id, item.title])).toEqual([
      ["offline-3", "Imported duplicate"],
      ["offline-2", "Imported unique"]
    ]);
  });

  it("renames duplicate ids inside the same rescue import", () => {
    const restored = prepareQueuedCaptureRestore(
      [
        { ...draft, id: "offline-1", title: "First" },
        { ...draft, id: "offline-1", title: "Second" }
      ],
      [],
      idGenerator(["offline-1", "offline-2"])
    );

    expect(restored.renamedCount).toBe(1);
    expect(restored.drafts.map((item) => [item.id, item.title])).toEqual([
      ["offline-1", "First"],
      ["offline-2", "Second"]
    ]);
  });

  it("syncs queued captures with tags", async () => {
    const { client, operations } = mockOfflineClient();

    await expect(syncQueuedCaptureDraft("user-1", draft, client as never)).resolves.toBe(true);
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"]
    ]);
  });

  it("syncs queued screenshots through storage and attachment metadata", async () => {
    const { client, operations, storageOperations } = mockOfflineClient();
    const screenshotDraft: OfflineCaptureDraft = {
      ...draft,
      type: "screenshot",
      title: "Receipt",
      url: null,
      files: [new File(["receipt"], "receipt.png", { type: "image/png" })]
    };

    await expect(syncQueuedCaptureDraft("user-1", screenshotDraft, client as never)).resolves.toBe(true);
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["attachments", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"]
    ]);
    expect(storageOperations).toEqual([
      {
        action: "upload",
        path: expect.stringMatching(/^user-1\/captures-1\/\d+-receipt\.png$/),
        contentType: "image/png"
      }
    ]);
    expect(operations.find((operation) => operation.table === "captures")?.payload).toMatchObject({
      type: "screenshot",
      created_at: "2026-07-01T10:00:00.000Z"
    });
    expect(operations.find((operation) => operation.table === "attachments")?.payload).toEqual([
      expect.objectContaining({ filename: "receipt.png", content_type: "image/png", size_bytes: 7 })
    ]);
  });

  it("rolls back the inserted capture when tag sync fails", async () => {
    const { client, operations } = mockOfflineClient({ failTagging: true });

    await expect(syncQueuedCaptureDraft("user-1", draft, client as never)).resolves.toBe(false);
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"],
      ["captures", "delete"]
    ]);
  });

  it("leaves the queued item retryable when the capture insert fails", async () => {
    const { client, operations } = mockOfflineClient({ failCapture: true });

    await expect(syncQueuedCaptureDraft("user-1", draft, client as never)).resolves.toBe(false);
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([["captures", "insert"]]);
  });

  it("leaves oversized queued screenshots retryable without writing rows", async () => {
    const { client, operations, storageOperations } = mockOfflineClient();
    const screenshotDraft: OfflineCaptureDraft = {
      ...draft,
      type: "screenshot",
      title: "Huge screenshot",
      url: null,
      files: [sizedImageFile("huge.png", CAPTURE_MAX_IMAGE_FILE_BYTES + 1)]
    };

    await expect(syncQueuedCaptureDraft("user-1", screenshotDraft, client as never)).resolves.toBe(false);
    expect(operations).toEqual([]);
    expect(storageOperations).toEqual([]);
  });
});

function sizedImageFile(name: string, size: number, type = "image/png") {
  return { name, size, type } as File;
}

function idGenerator(ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}
