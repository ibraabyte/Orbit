import { afterEach, describe, expect, it, vi } from "vitest";
import { IMPORT_TABLES, SKIPPED_IMPORT_TABLES, backupImportCountsForUser, importBackupData, parseBackupPayload } from "@/lib/backup-import";
import { EXPORT_TABLES, buildFullExportPayload, type FullExportData } from "@/lib/export";

afterEach(() => {
  vi.restoreAllMocks();
});

function emptyExportData(overrides: Partial<FullExportData> = {}): FullExportData {
  const data = Object.fromEntries(EXPORT_TABLES.map((definition) => [definition.name, []])) as unknown as FullExportData;
  return { ...data, ...overrides };
}

function mockClient(existingTags: Record<string, unknown>[] = [], options: { failUpsertTable?: string } = {}) {
  const upserts: Array<{ table: string; rows: Record<string, unknown>[]; onConflict: string }> = [];
  const selects: Array<{ table: string; columns: string; column: string; value: string }> = [];
  const uploads: Array<{ bucket: string; path: string; contentType?: string; upsert?: boolean }> = [];
  const removals: Array<{ bucket: string; paths: string[] }> = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            async eq(column: string, value: string) {
              selects.push({ table, columns, column, value });
              return {
                data: table === "tags" ? existingTags : [],
                error: null
              };
            }
          };
        },
        async upsert(rows: Record<string, unknown>[], upsertOptions: { onConflict: string }) {
          upserts.push({ table, rows, onConflict: upsertOptions.onConflict });
          return { error: table === options.failUpsertTable ? { message: `${table} denied` } : null };
        }
      };
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, file: Blob, uploadOptions: { contentType?: string; upsert?: boolean }) {
            expect(file).toBeInstanceOf(Blob);
            uploads.push({ bucket, path, contentType: uploadOptions.contentType, upsert: uploadOptions.upsert });
            return { error: null };
          },
          async remove(paths: string[]) {
            removals.push({ bucket, paths });
            return { error: null };
          }
        };
      }
    }
  };

  return { client, upserts, selects, uploads, removals };
}

describe("backup import", () => {
  it("classifies every exported table as imported or intentionally skipped", () => {
    const exported = EXPORT_TABLES.map((definition) => definition.name).sort();
    const imported = [...IMPORT_TABLES].sort() as string[];
    const skipped = [...SKIPPED_IMPORT_TABLES].sort() as string[];
    const classified = [...IMPORT_TABLES, ...SKIPPED_IMPORT_TABLES].sort() as string[];

    expect(classified).toEqual(exported);
    expect(imported.filter((table) => skipped.includes(table))).toEqual([]);
  });

  it("parses full database exports and rejects older partial payloads", () => {
    const payload = buildFullExportPayload(
      "source-user",
      emptyExportData({
        tasks: [{ id: "task-1" }],
        push_subscriptions: [{ id: "push-1" }]
      }),
      "2026-07-01T10:00:00.000Z"
    );

    expect(parseBackupPayload(payload)).toMatchObject({
      exportedAt: "2026-07-01T10:00:00.000Z",
      sourceUserId: "source-user",
      importableTotal: 1,
      skippedTotal: 1
    });
    expect(() => parseBackupPayload({ version: 1, data: {} })).toThrow("Only full database exports");
  });

  it("imports rows under the current user, reuses existing tags, and skips device subscriptions and cross-account attachment metadata", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          profiles: [
            {
              id: "source-user",
              display_name: "Source",
              timezone: "UTC",
              daily_protein_target: 160,
              daily_carbs_target: 240,
              daily_fat_target: 70,
              dashboard_modules: ["tasks", "food"],
              extra: "ignored"
            }
          ],
          tasks: [{ id: "task-1", user_id: "source-user", title: "Task", status: "open", priority: "normal", extra: "ignored" }],
          people: [{ id: "person-1", user_id: "source-user", name: "Sara", relationship: "friend", favorite: true, extra: "ignored" }],
          tags: [{ id: "tag-1", user_id: "source-user", name: "gym", color: null }],
          taggings: [{ id: "tagging-1", user_id: "source-user", tag_id: "tag-1", target_type: "task", target_id: "task-1" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png"
            }
          ],
          push_subscriptions: [{ id: "push-1", user_id: "source-user" }]
        })
      )
    );
    const { client, upserts } = mockClient([{ id: "existing-tag", name: "gym" }]);

    expect(backupImportCountsForUser(plan, "current-user")).toEqual({
      importableTotal: 5,
      skippedTotal: 2,
      skippedAttachmentMetadata: 1
    });

    const result = await importBackupData("current-user", plan, client);

    expect(result).toMatchObject({
      reusedTags: 1,
      totalImported: 4,
      skippedAttachmentMetadata: 1,
      totalSkipped: 2,
      skipped: {
        push_subscriptions: 1
      }
    });
    expect(upserts.find((entry) => entry.table === "profiles")?.rows[0]).toMatchObject({
      id: "current-user",
      display_name: "Source",
      daily_protein_target: 160,
      daily_carbs_target: 240,
      daily_fat_target: 70,
      dashboard_modules: ["tasks", "food"]
    });
    expect(upserts.find((entry) => entry.table === "tasks")?.rows[0]).toMatchObject({ id: "task-1", user_id: "current-user", title: "Task" });
    expect(upserts.find((entry) => entry.table === "tasks")?.rows[0]).not.toHaveProperty("extra");
    expect(upserts.find((entry) => entry.table === "people")?.rows[0]).toMatchObject({ id: "person-1", user_id: "current-user", name: "Sara", favorite: true });
    expect(upserts.find((entry) => entry.table === "people")?.rows[0]).not.toHaveProperty("extra");
    expect(upserts.some((entry) => entry.table === "tags")).toBe(false);
    expect(upserts.find((entry) => entry.table === "taggings")?.rows[0]).toMatchObject({
      user_id: "current-user",
      tag_id: "existing-tag"
    });
    expect(upserts.some((entry) => entry.table === "attachments")).toBe(false);
  });

  it("imports attachment metadata when the backup belongs to the same user", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "current-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "current-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "current-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "current-user/capture/file.png",
              filename: "file.png"
            }
          ]
        })
      )
    );
    const { client, upserts } = mockClient();

    expect(backupImportCountsForUser(plan, "current-user")).toEqual({
      importableTotal: 2,
      skippedTotal: 0,
      skippedAttachmentMetadata: 0
    });

    const result = await importBackupData("current-user", plan, client);

    expect(result).toMatchObject({ totalImported: 2, skippedAttachmentMetadata: 0, totalSkipped: 0 });
    expect(upserts.find((entry) => entry.table === "attachments")?.rows[0]).toMatchObject({
      user_id: "current-user",
      object_path: "current-user/capture/file.png"
    });
  });

  it("skips unsafe attachment metadata instead of importing arbitrary storage paths", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "current-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "current-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "current-user",
              capture_id: "capture-1",
              bucket: "other-bucket",
              object_path: "current-user/capture/file.png",
              filename: "file.png"
            },
            {
              id: "attachment-2",
              user_id: "current-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "other-user/capture/file.png",
              filename: "other-file.png"
            }
          ]
        })
      )
    );
    const { client, upserts } = mockClient();

    expect(backupImportCountsForUser(plan, "current-user")).toEqual({
      importableTotal: 1,
      skippedTotal: 2,
      skippedAttachmentMetadata: 2
    });

    const result = await importBackupData("current-user", plan, client);

    expect(result).toMatchObject({ totalImported: 1, skippedAttachmentMetadata: 2, totalSkipped: 2 });
    expect(upserts.some((entry) => entry.table === "attachments")).toBe(false);
  });

  it("detaches optional dangling references and skips rows with required missing parents", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "current-user",
        emptyExportData({
          reminders: [
            {
              id: "reminder-1",
              user_id: "current-user",
              task_id: "missing-task",
              title: "Standalone reminder",
              remind_at: "2026-07-01T10:00:00.000Z"
            }
          ],
          attachments: [
            {
              id: "attachment-1",
              user_id: "current-user",
              capture_id: "missing-capture",
              bucket: "orbit-attachments",
              object_path: "current-user/capture/file.png",
              filename: "file.png"
            }
          ],
          grocery_items: [
            {
              id: "grocery-1",
              user_id: "current-user",
              meal_plan_id: "missing-meal-plan",
              name: "Rice",
              quantity: "1 bag",
              category: "pantry",
              status: "needed"
            }
          ],
          focus_sessions: [
            {
              id: "focus-1",
              user_id: "current-user",
              task_id: "missing-task",
              title: "Deep work",
              duration_minutes: 50,
              started_at: "2026-07-01T11:00:00.000Z",
              status: "completed"
            }
          ],
          tags: [{ id: "tag-1", user_id: "current-user", name: "health" }],
          taggings: [{ id: "tagging-1", user_id: "current-user", tag_id: "tag-1", target_type: "task", target_id: "missing-task" }],
          habit_logs: [{ id: "habit-log-1", user_id: "current-user", habit_id: "missing-habit", logged_at: "2026-07-01T10:00:00.000Z" }],
          goal_milestones: [{ id: "milestone-1", user_id: "current-user", goal_id: "missing-goal", title: "Milestone" }]
        })
      )
    );
    const { client, upserts } = mockClient();

    const result = await importBackupData("current-user", plan, client);

    expect(result).toMatchObject({
      totalImported: 5,
      skippedInvalidReferences: 3,
      totalSkipped: 3
    });
    expect(upserts.find((entry) => entry.table === "reminders")?.rows[0]).toMatchObject({ task_id: null });
    expect(upserts.find((entry) => entry.table === "attachments")?.rows[0]).toMatchObject({ capture_id: null });
    expect(upserts.find((entry) => entry.table === "grocery_items")?.rows[0]).toMatchObject({ meal_plan_id: null });
    expect(upserts.find((entry) => entry.table === "focus_sessions")?.rows[0]).toMatchObject({ task_id: null });
    expect(upserts.some((entry) => entry.table === "taggings")).toBe(false);
    expect(upserts.some((entry) => entry.table === "habit_logs")).toBe(false);
    expect(upserts.some((entry) => entry.table === "goal_milestones")).toBe(false);
  });

  it("restores embedded attachment files for cross-account portable backups", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png",
              size_bytes: 5
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: 5,
            sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
            dataBase64: "aGVsbG8="
          }
        ]
      )
    );
    const { client, upserts, uploads } = mockClient();

    expect(plan.version).toBe(3);
    expect(backupImportCountsForUser(plan, "current-user")).toEqual({
      importableTotal: 2,
      skippedTotal: 0,
      skippedAttachmentMetadata: 0
    });

    const result = await importBackupData("current-user", plan, client);

    expect(result).toMatchObject({ totalImported: 2, skippedAttachmentMetadata: 0, totalSkipped: 0 });
    expect(uploads).toEqual([
      {
        bucket: "orbit-attachments",
        path: "current-user/capture/file.png",
        contentType: "image/png",
        upsert: true
      }
    ]);
    expect(upserts.find((entry) => entry.table === "attachments")?.rows[0]).toMatchObject({
      user_id: "current-user",
      object_path: "current-user/capture/file.png"
    });
  });

  it("rejects corrupted embedded attachment files before storage upload", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png",
              size_bytes: 999
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: 999,
            dataBase64: "aGVsbG8="
          }
        ]
      )
    );
    const { client, uploads } = mockClient();

    await expect(importBackupData("current-user", plan, client)).rejects.toThrow("restored file size does not match backup metadata");
    expect(uploads).toEqual([]);
  });

  it("rejects embedded attachment files when the checksum does not match", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png",
              size_bytes: 5
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: 5,
            sha256: "0000000000000000000000000000000000000000000000000000000000000000",
            dataBase64: "aGVsbG8="
          }
        ]
      )
    );
    const { client, uploads } = mockClient();

    await expect(importBackupData("current-user", plan, client)).rejects.toThrow("restored file checksum does not match backup metadata");
    expect(uploads).toEqual([]);
  });

  it("rejects unreadable embedded attachment data before decoding", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png"
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: null,
            dataBase64: "not valid base64"
          }
        ]
      )
    );
    const { client, uploads } = mockClient();
    const atobSpy = vi.spyOn(globalThis, "atob");

    await expect(importBackupData("current-user", plan, client)).rejects.toThrow("embedded file data is unreadable");
    expect(atobSpy).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
  });

  it("rejects oversized embedded attachment data before storage upload", async () => {
    const oversizedBase64 = "A".repeat(Math.ceil((10 * 1024 * 1024 + 1) / 3) * 4);
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png"
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: null,
            dataBase64: oversizedBase64
          }
        ]
      )
    );
    const { client, uploads } = mockClient();

    await expect(importBackupData("current-user", plan, client)).rejects.toThrow("restored file exceeds the 10 MB attachment limit");
    expect(uploads).toEqual([]);
  });

  it("removes restored attachment files when attachment metadata upsert fails", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          captures: [{ id: "capture-1", user_id: "source-user", type: "screenshot", title: "Capture" }],
          attachments: [
            {
              id: "attachment-1",
              user_id: "source-user",
              capture_id: "capture-1",
              bucket: "orbit-attachments",
              object_path: "source-user/capture/file.png",
              filename: "file.png",
              content_type: "image/png"
            }
          ]
        }),
        "2026-07-01T10:00:00.000Z",
        [
          {
            attachmentId: "attachment-1",
            bucket: "orbit-attachments",
            objectPath: "source-user/capture/file.png",
            filename: "file.png",
            contentType: "image/png",
            sizeBytes: null,
            dataBase64: "aGVsbG8="
          }
        ]
      )
    );
    const { client, removals } = mockClient([], { failUpsertTable: "attachments" });

    await expect(importBackupData("current-user", plan, client)).rejects.toThrow("attachments: attachments denied");
    expect(removals).toEqual([{ bucket: "orbit-attachments", paths: ["current-user/capture/file.png"] }]);
  });

  it("imports dependency tables after their parents", async () => {
    const plan = parseBackupPayload(
      buildFullExportPayload(
        "source-user",
        emptyExportData({
          tasks: [{ id: "task-1", user_id: "source-user", title: "Task", status: "open", priority: "normal" }],
          reminders: [{ id: "reminder-1", user_id: "source-user", task_id: "task-1", title: "Reminder", remind_at: "2026-07-01T10:00:00.000Z" }],
          captures: [{ id: "capture-1", user_id: "source-user", type: "link", title: "Capture" }],
          attachments: [{ id: "attachment-1", user_id: "source-user", capture_id: "capture-1", bucket: "orbit-attachments", object_path: "source-user/file.png", filename: "file.png" }],
          tags: [{ id: "tag-1", user_id: "source-user", name: "health" }],
          taggings: [
            { id: "tagging-1", user_id: "source-user", tag_id: "tag-1", target_type: "task", target_id: "task-1" },
            { id: "tagging-4", user_id: "source-user", tag_id: "tag-1", target_type: "sleep", target_id: "sleep-1" },
            { id: "tagging-5", user_id: "source-user", tag_id: "tag-1", target_type: "focus_session", target_id: "focus-1" },
            { id: "tagging-6", user_id: "source-user", tag_id: "tag-1", target_type: "meal_plan", target_id: "meal-plan-1" },
            { id: "tagging-7", user_id: "source-user", tag_id: "tag-1", target_type: "grocery_item", target_id: "grocery-1" },
            { id: "tagging-2", user_id: "source-user", tag_id: "tag-1", target_type: "expense", target_id: "expense-1" },
            { id: "tagging-3", user_id: "source-user", tag_id: "tag-1", target_type: "bill", target_id: "bill-1" }
          ],
          meal_plans: [
            {
              id: "meal-plan-1",
              user_id: "source-user",
              name: "Dinner",
              plan_date: "2026-07-01",
              meal_type: "dinner",
              calories: 700,
              status: "planned"
            }
          ],
          grocery_items: [
            {
              id: "grocery-1",
              user_id: "source-user",
              meal_plan_id: "meal-plan-1",
              name: "Rice",
              quantity: "1 bag",
              category: "pantry",
              status: "needed",
              due_at: "2026-07-01"
            }
          ],
          sleep_logs: [
            {
              id: "sleep-1",
              user_id: "source-user",
              sleep_date: "2026-07-01",
              duration_minutes: 420,
              quality: 4
            }
          ],
          focus_sessions: [
            {
              id: "focus-1",
              user_id: "source-user",
              task_id: "task-1",
              title: "Deep work",
              duration_minutes: 50,
              started_at: "2026-07-01T11:00:00.000Z",
              ended_at: "2026-07-01T11:50:00.000Z",
              status: "completed",
              energy: 4
            }
          ],
          expenses: [
            {
              id: "expense-1",
              user_id: "source-user",
              merchant: "Coffee",
              amount: 4.5,
              currency: "USD",
              category: "food",
              spent_at: "2026-07-01T10:00:00.000Z"
            }
          ],
          bills: [
            {
              id: "bill-1",
              user_id: "source-user",
              name: "Internet",
              amount: 65,
              currency: "USD",
              category: "home",
              due_at: "2026-07-10",
              recurrence: "monthly",
              status: "active",
              autopay: true
            }
          ],
          habits: [{ id: "habit-1", user_id: "source-user", name: "Walk", frequency: "daily", target_count: 1 }],
          habit_logs: [{ id: "habit-log-1", user_id: "source-user", habit_id: "habit-1", logged_at: "2026-07-01T10:00:00.000Z" }],
          goals: [{ id: "goal-1", user_id: "source-user", title: "Goal", status: "active" }],
          goal_milestones: [{ id: "milestone-1", user_id: "source-user", goal_id: "goal-1", title: "Milestone" }]
        })
      )
    );
    const { client, upserts } = mockClient();

    await importBackupData("source-user", plan, client);
    const order = upserts.map((entry) => entry.table);

    expect(order.indexOf("tasks")).toBeLessThan(order.indexOf("reminders"));
    expect(order.indexOf("captures")).toBeLessThan(order.indexOf("attachments"));
    expect(order.indexOf("tags")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("meal_plans")).toBeLessThan(order.indexOf("grocery_items"));
    expect(order.indexOf("meal_plans")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("grocery_items")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("sleep_logs")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("focus_sessions")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("expenses")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("bills")).toBeLessThan(order.indexOf("taggings"));
    expect(order.indexOf("habits")).toBeLessThan(order.indexOf("habit_logs"));
    expect(order.indexOf("goals")).toBeLessThan(order.indexOf("goal_milestones"));
  });
});
