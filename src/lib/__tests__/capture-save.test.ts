import { describe, expect, it } from "vitest";
import { CAPTURE_MAX_IMAGE_FILE_BYTES } from "@/lib/capture-files";
import { saveOnlineCapture } from "@/lib/capture-save";

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

describe("online capture save", () => {
  it("saves multiple screenshots as one capture with attachment metadata and tags", async () => {
    const { client, operations, storageOperations } = mockCaptureClient();
    const files = [
      new File(["front"], "front.png", { type: "image/png" }),
      new File(["back"], "back.jpg", { type: "image/jpeg" })
    ];

    await expect(
      saveOnlineCapture(
        {
          userId: "user-1",
          type: "note",
          title: "Receipts",
          url: null,
          note: "Tax docs",
          tagNames: ["tax"],
          files
        },
        client as never,
        123456
      )
    ).resolves.toMatchObject({ id: "captures-1", type: "screenshot", title: "Receipts" });

    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["attachments", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"]
    ]);
    expect(storageOperations).toEqual([
      { action: "upload", path: "user-1/captures-1/123456-front.png", contentType: "image/png" },
      { action: "upload", path: "user-1/captures-1/123457-back.jpg", contentType: "image/jpeg" }
    ]);
    expect(operations.find((operation) => operation.table === "attachments")?.payload).toEqual([
      expect.objectContaining({ object_path: "user-1/captures-1/123456-front.png", filename: "front.png" }),
      expect.objectContaining({ object_path: "user-1/captures-1/123457-back.jpg", filename: "back.jpg" })
    ]);
  });

  it("rolls back uploaded files and rows when attachment metadata cannot be saved", async () => {
    const { client, operations, storageOperations } = mockCaptureClient({ failAttachments: true });
    const files = [new File(["front"], "front.png", { type: "image/png" }), new File(["back"], "back.jpg", { type: "image/jpeg" })];

    await expect(
      saveOnlineCapture(
        {
          userId: "user-1",
          type: "screenshot",
          title: "Receipts",
          url: null,
          note: null,
          tagNames: [],
          files
        },
        client as never,
        123456
      )
    ).rejects.toThrow("attachment denied");

    expect(storageOperations.at(-1)).toEqual({
      action: "remove",
      paths: ["user-1/captures-1/123456-front.png", "user-1/captures-1/123457-back.jpg"]
    });
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["attachments", "insert"],
      ["attachments", "delete"],
      ["captures", "delete"]
    ]);
  });

  it("rolls back the capture and uploaded files when tag syncing fails", async () => {
    const { client, operations, storageOperations } = mockCaptureClient({ failTaggings: true });
    const files = [new File(["front"], "front.png", { type: "image/png" })];

    await expect(
      saveOnlineCapture(
        {
          userId: "user-1",
          type: "screenshot",
          title: "Receipt",
          url: null,
          note: null,
          tagNames: ["tax"],
          files
        },
        client as never,
        123456
      )
    ).rejects.toThrow("tagging denied");

    expect(storageOperations.at(-1)).toEqual({ action: "remove", paths: ["user-1/captures-1/123456-front.png"] });
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["attachments", "insert"],
      ["tags", "select"],
      ["tags", "insert"],
      ["taggings", "upsert"],
      ["attachments", "delete"],
      ["captures", "delete"]
    ]);
  });

  it("removes already-uploaded files when a later upload fails", async () => {
    const { client, operations, storageOperations } = mockCaptureClient({ failUploadIndex: 1 });
    const files = [
      new File(["front"], "front.png", { type: "image/png" }),
      new File(["back"], "back.jpg", { type: "image/jpeg" })
    ];

    await expect(
      saveOnlineCapture(
        {
          userId: "user-1",
          type: "screenshot",
          title: "Receipts",
          url: null,
          note: null,
          tagNames: [],
          files
        },
        client as never,
        123456
      )
    ).rejects.toThrow("upload denied");

    expect(storageOperations).toEqual([
      { action: "upload", path: "user-1/captures-1/123456-front.png", contentType: "image/png" },
      { action: "upload", path: "user-1/captures-1/123457-back.jpg", contentType: "image/jpeg" },
      { action: "remove", paths: ["user-1/captures-1/123456-front.png"] }
    ]);
    expect(operations.map((operation) => [operation.table, operation.action])).toEqual([
      ["captures", "insert"],
      ["attachments", "delete"],
      ["captures", "delete"]
    ]);
  });

  it("rejects oversized screenshots before writing capture rows", async () => {
    const { client, operations, storageOperations } = mockCaptureClient();

    await expect(
      saveOnlineCapture(
        {
          userId: "user-1",
          type: "screenshot",
          title: "Too large",
          url: null,
          note: null,
          tagNames: [],
          files: [sizedImageFile("huge.png", CAPTURE_MAX_IMAGE_FILE_BYTES + 1)]
        },
        client as never
      )
    ).rejects.toThrow('"huge.png" is over the 10 MB image limit.');

    expect(operations).toEqual([]);
    expect(storageOperations).toEqual([]);
  });
});

function mockCaptureClient(
  settings: {
    failAttachments?: boolean;
    failTaggings?: boolean;
    failUploadIndex?: number;
  } = {}
) {
  const operations: Operation[] = [];
  const storageOperations: StorageOperation[] = [];
  const counters = new Map<string, number>();
  let uploadCount = 0;

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
        insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
          operations.push({ table, action: "insert", payload });
          const result = {
            data: null,
            error: settings.failAttachments && table === "attachments" ? { message: "attachment denied" } : null
          };

          return {
            select() {
              return {
                async single() {
                  return { data: rowFor(table, payload as Record<string, unknown>, counters), error: null };
                }
              };
            },
            then(resolve: (value: typeof result) => void, reject?: (reason: unknown) => void) {
              return Promise.resolve(result).then(resolve, reject);
            }
          };
        },
        async upsert(payload: Record<string, unknown>[]) {
          operations.push({ table, action: "upsert", payload });
          return { error: settings.failTaggings && table === "taggings" ? { message: "tagging denied" } : null };
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
            const currentIndex = uploadCount;
            uploadCount += 1;
            storageOperations.push({ action: "upload", path, contentType: uploadOptions.contentType });
            return { error: currentIndex === settings.failUploadIndex ? { message: "upload denied" } : null };
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

function rowFor(table: string, payload: Record<string, unknown>, counters: Map<string, number>) {
  const next = (counters.get(table) ?? 0) + 1;
  counters.set(table, next);
  return { ...payload, id: `${table}-${next}`, created_at: "2026-07-01T00:00:00.000Z" };
}

function sizedImageFile(name: string, size: number, type = "image/png") {
  return { name, size, type } as File;
}
