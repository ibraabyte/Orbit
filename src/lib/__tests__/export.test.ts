import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_TABLES,
  buildCsvExportFiles,
  buildFullExportPayload,
  buildFullExportSummary,
  buildZipArchive,
  downloadText,
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

  it("loads the export from the server, fills missing tables, and redacts push secrets", async () => {
    const api = {
      get: vi.fn(async () => ({
        meals: [{ id: "meal-1", name: "Lunch" }],
        push_subscriptions: [{ id: "push-1", endpoint: "https://push.example/subscription-1", p256dh: "browser-public-key", auth: "browser-auth-secret" }]
      }))
    };

    const data = await loadFullExportData(api as never);
    expect(api.get).toHaveBeenCalledWith("/export");
    expect(Object.keys(data)).toEqual(EXPORT_TABLES.map((definition) => definition.name));
    expect(data.meals).toEqual([{ id: "meal-1", name: "Lunch" }]);
    expect(data.tasks).toEqual([]);
    expect(data.push_subscriptions[0]).toMatchObject({ endpoint: "[redacted]", p256dh: "[redacted]", auth: "[redacted]" });
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
});

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Blob could not be read."));
    reader.readAsText(blob);
  });
}
