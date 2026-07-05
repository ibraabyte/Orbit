import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_TABLES,
  buildCsvExportFiles,
  buildFullExportPayload,
  buildFullExportSummary,
  buildZipArchive,
  downloadText,
  loadFullExportAttachmentFiles,
  loadFullExportData,
  redactFullExportData,
  rowsToCsv,
  type FullExportData
} from "@/lib/export";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function emptyExportData(overrides: Partial<FullExportData> = {}): FullExportData {
  const data = Object.fromEntries(EXPORT_TABLES.map((definition) => [definition.name, []])) as unknown as FullExportData;
  return { ...data, ...overrides };
}

describe("full data export", () => {
  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    vi.restoreAllMocks();
  });

  it("builds a versioned full export payload with table counts", () => {
    const data = emptyExportData({
      profiles: [{ id: "user-1" }],
      tasks: [{ id: "task-1" }, { id: "task-2" }],
      captures: [{ id: "capture-1" }]
    });

    expect(buildFullExportPayload("user-1", data, "2026-07-01T10:00:00.000Z")).toMatchObject({
      exportedAt: "2026-07-01T10:00:00.000Z",
      userId: "user-1",
      version: 2,
      scope: "full-database",
      summary: {
        profiles: 1,
        tasks: 2,
        captures: 1
      }
    });
  });

  it("builds a portable version 3 payload when attachment files are embedded", () => {
    const data = emptyExportData({
      attachments: [{ id: "attachment-1", object_path: "user-1/capture/file.png" }]
    });
    const attachmentFiles = [
      {
        attachmentId: "attachment-1",
        bucket: "orbit-attachments",
        objectPath: "user-1/capture/file.png",
        filename: "file.png",
        contentType: "image/png",
        sizeBytes: 5,
        dataBase64: "aGVsbG8="
      }
    ];

    expect(buildFullExportPayload("user-1", data, "2026-07-01T10:00:00.000Z", attachmentFiles)).toMatchObject({
      version: 3,
      fileSummary: { attachments: 1 },
      files: { attachments: attachmentFiles }
    });
  });

  it("redacts non-portable push subscription secrets from JSON and CSV exports", () => {
    const data = emptyExportData({
      push_subscriptions: [
        {
          id: "push-1",
          user_id: "user-1",
          endpoint: "https://push.example/subscription-1",
          p256dh: "browser-public-key",
          auth: "browser-auth-secret",
          created_at: "2026-07-01T10:00:00.000Z"
        }
      ]
    });

    const redacted = redactFullExportData(data);
    const payload = buildFullExportPayload("user-1", data, "2026-07-01T10:00:00.000Z");
    const csv = buildCsvExportFiles(data).find((file) => file.table === "push_subscriptions")?.content ?? "";

    expect(redacted.push_subscriptions[0]).toMatchObject({
      endpoint: "[redacted]",
      p256dh: "[redacted]",
      auth: "[redacted]"
    });
    expect(payload.summary.push_subscriptions).toBe(1);
    expect(JSON.stringify(payload)).not.toContain("https://push.example/subscription-1");
    expect(JSON.stringify(payload)).not.toContain("browser-auth-secret");
    expect(csv).toContain("[redacted]");
    expect(csv).not.toContain("browser-public-key");
  });

  it("redacts push subscription secrets while loading export rows", async () => {
    const tableRows = new Map<string, Record<string, unknown>[]>(
      EXPORT_TABLES.map((definition) => [definition.name, [] as Record<string, unknown>[]])
    );
    tableRows.set("push_subscriptions", [
      {
        id: "push-1",
        user_id: "user-1",
        endpoint: "https://push.example/subscription-1",
        p256dh: "browser-public-key",
        auth: "browser-auth-secret"
      }
    ]);

    const client = {
      from(table: string) {
        const chain = {
          select() {
            return chain;
          },
          eq() {
            return chain;
          },
          order() {
            return chain;
          },
          async range(from: number, to: number) {
            return {
              data: (tableRows.get(table) ?? []).slice(from, to + 1),
              error: null
            };
          }
        };
        return chain;
      }
    };

    await expect(loadFullExportData("user-1", client as never)).resolves.toMatchObject({
      push_subscriptions: [
        {
          endpoint: "[redacted]",
          p256dh: "[redacted]",
          auth: "[redacted]"
        }
      ]
    });
  });

  it("summarizes every configured export table", () => {
    const summary = buildFullExportSummary(emptyExportData({ tasks: [{ id: "task-1" }] }));

    expect(Object.keys(summary)).toEqual(EXPORT_TABLES.map((definition) => definition.name));
    expect(summary.tasks).toBe(1);
    expect(summary.meal_plans).toBe(0);
    expect(summary.grocery_items).toBe(0);
    expect(summary.people).toBe(0);
    expect(summary.sleep_logs).toBe(0);
    expect(summary.focus_sessions).toBe(0);
    expect(summary.expenses).toBe(0);
    expect(summary.bills).toBe(0);
    expect(summary.journal_entries).toBe(0);
  });

  it("serializes rows to spreadsheet-safe CSV", () => {
    expect(
      rowsToCsv([
        {
          id: "task-1",
          title: "Call, then review",
          notes: "Line 1\nLine 2",
          done: false,
          tags: ["admin", "home"],
          empty: null
        },
        {
          id: "task-2",
          title: "Plain",
          extra: "later column"
        }
      ])
    ).toBe(
      [
        "id,title,notes,done,tags,empty,extra",
        "task-1,\"Call, then review\",\"Line 1\nLine 2\",false,\"[\"\"admin\"\",\"\"home\"\"]\",,",
        "task-2,Plain,,,,,later column",
        ""
      ].join("\r\n")
    );
  });

  it("builds one CSV file for every exported table", () => {
    const files = buildCsvExportFiles(
      emptyExportData({
        tasks: [{ id: "task-1", title: "Task" }],
        meals: []
      })
    );

    expect(files.map((file) => file.filename)).toEqual(EXPORT_TABLES.map((definition) => `${definition.name}.csv`));
    expect(files.find((file) => file.table === "tasks")).toMatchObject({
      filename: "tasks.csv",
      rowCount: 1,
      content: "id,title\r\ntask-1,Task\r\n"
    });
    expect(files.find((file) => file.table === "meals")).toMatchObject({
      filename: "meals.csv",
      rowCount: 0,
      content: ""
    });
  });

  it("builds a zip archive containing CSV files", () => {
    const archive = buildZipArchive([
      { filename: "tasks.csv", content: "id,title\r\ntask-1,Task\r\n" },
      { filename: "meals.csv", content: "" }
    ]);
    const view = new DataView(archive.buffer);
    const decoded = new TextDecoder().decode(archive);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
    expect(decoded).toContain("tasks.csv");
    expect(decoded).toContain("meals.csv");
    expect(decoded).toContain("task-1,Task");
  });

  it("downloads text files through the shared browser download helper", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:orbit-report");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    downloadText("orbit-launch-qa.md", "Orbit launch QA", "text/markdown;charset=utf-8");

    const blob = createObjectURL.mock.calls[0][0];
    await expect(readBlobText(blob)).resolves.toBe("Orbit launch QA");
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orbit-report");
  });

  it("loads all pages for every owner-scoped table", async () => {
    const tableRows = new Map<string, Record<string, unknown>[]>(
      EXPORT_TABLES.map((definition) => [definition.name, [] as Record<string, unknown>[]])
    );
    tableRows.set("profiles", [{ id: "user-1" }]);
    tableRows.set(
      "tasks",
      Array.from({ length: 1001 }, (_, index) => ({
        id: `task-${index}`,
        user_id: "user-1"
      }))
    );

    const requests: Array<{ table: string; ownerColumn: string; value: string; from: number; to: number }> = [];
    const client = {
      from(table: string) {
        const chain = {
          select() {
            return chain;
          },
          eq(ownerColumn: string, value: string) {
            state.ownerColumn = ownerColumn;
            state.value = value;
            return chain;
          },
          order() {
            return chain;
          },
          async range(from: number, to: number) {
            requests.push({ table, ownerColumn: state.ownerColumn, value: state.value, from, to });
            return {
              data: (tableRows.get(table) ?? []).slice(from, to + 1),
              error: null
            };
          }
        };
        const state = { ownerColumn: "", value: "" };
        return chain;
      }
    };

    const data = await loadFullExportData("user-1", client as never);

    expect(data.profiles).toHaveLength(1);
    expect(data.tasks).toHaveLength(1001);
    expect(requests.filter((request) => request.table === "tasks")).toEqual([
      { table: "tasks", ownerColumn: "user_id", value: "user-1", from: 0, to: 999 },
      { table: "tasks", ownerColumn: "user_id", value: "user-1", from: 1000, to: 1999 }
    ]);
    expect(requests.find((request) => request.table === "profiles")).toMatchObject({
      ownerColumn: "id",
      value: "user-1"
    });
  });

  it("embeds private attachment files as base64 payloads", async () => {
    const downloads: Array<{ bucket: string; path: string }> = [];
    const client = {
      storage: {
        from(bucket: string) {
          return {
            async download(path: string) {
              downloads.push({ bucket, path });
              return {
                data: {
                  async arrayBuffer() {
                    return new TextEncoder().encode("hello").buffer;
                  }
                },
                error: null
              };
            }
          };
        }
      }
    };

    await expect(
      loadFullExportAttachmentFiles(
        "user-1",
        [
          {
            id: "attachment-1",
            bucket: "orbit-attachments",
            object_path: "user-1/capture/file.png",
            filename: "file.png",
            content_type: "image/png",
            size_bytes: 5
          }
        ],
        client as never
      )
    ).resolves.toEqual([
      {
        attachmentId: "attachment-1",
        bucket: "orbit-attachments",
        objectPath: "user-1/capture/file.png",
        filename: "file.png",
        contentType: "image/png",
        sizeBytes: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        dataBase64: "aGVsbG8="
      }
    ]);
    expect(downloads).toEqual([{ bucket: "orbit-attachments", path: "user-1/capture/file.png" }]);
  });

  it("rejects attachment downloads that do not match metadata", async () => {
    const client = {
      storage: {
        from() {
          return {
            async download() {
              return {
                data: {
                  async arrayBuffer() {
                    return new TextEncoder().encode("hello").buffer;
                  }
                },
                error: null
              };
            }
          };
        }
      }
    };

    await expect(
      loadFullExportAttachmentFiles(
        "user-1",
        [
          {
            id: "attachment-1",
            bucket: "orbit-attachments",
            object_path: "user-1/capture/file.png",
            filename: "file.png",
            size_bytes: 6
          }
        ],
        client as never
      )
    ).rejects.toThrow("downloaded file size does not match attachment metadata");
  });

  it("rejects oversized attachment downloads before embedding", async () => {
    const client = {
      storage: {
        from() {
          return {
            async download() {
              return {
                data: {
                  async arrayBuffer() {
                    return new ArrayBuffer(10 * 1024 * 1024 + 1);
                  }
                },
                error: null
              };
            }
          };
        }
      }
    };

    await expect(
      loadFullExportAttachmentFiles(
        "user-1",
        [
          {
            id: "attachment-1",
            bucket: "orbit-attachments",
            object_path: "user-1/capture/file.png",
            filename: "file.png",
            size_bytes: null
          }
        ],
        client as never
      )
    ).rejects.toThrow("downloaded file exceeds the 10 MB attachment limit");
  });

  it("skips unsafe attachment metadata when embedding export files", async () => {
    const downloads: Array<{ bucket: string; path: string }> = [];
    const client = {
      storage: {
        from(bucket: string) {
          return {
            async download(path: string) {
              downloads.push({ bucket, path });
              return {
                data: new Blob(["safe"], { type: "image/png" }),
                error: null
              };
            }
          };
        }
      }
    };

    await expect(
      loadFullExportAttachmentFiles(
        "user-1",
        [
          {
            id: "safe",
            bucket: "orbit-attachments",
            object_path: "user-1/capture/file.png",
            filename: "file.png"
          },
          {
            id: "other-user",
            bucket: "orbit-attachments",
            object_path: "user-2/capture/file.png",
            filename: "file.png"
          },
          {
            id: "other-bucket",
            bucket: "public-assets",
            object_path: "user-1/capture/file.png",
            filename: "file.png"
          },
          {
            id: "traversal",
            bucket: "orbit-attachments",
            object_path: "user-1/../file.png",
            filename: "file.png"
          },
          {
            id: "backslash",
            bucket: "orbit-attachments",
            object_path: "user-1\\capture\\file.png",
            filename: "file.png"
          }
        ],
        client as never
      )
    ).resolves.toMatchObject([
      {
        attachmentId: "safe",
        bucket: "orbit-attachments",
        objectPath: "user-1/capture/file.png"
      }
    ]);
    expect(downloads).toEqual([{ bucket: "orbit-attachments", path: "user-1/capture/file.png" }]);
  });
});

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Blob could not be read."));
    reader.readAsText(blob);
  });
}
