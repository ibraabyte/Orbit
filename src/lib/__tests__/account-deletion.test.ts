import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETE_TABLES, deleteAccountRows, deleteAccountStorageObjects } from "@/lib/account-deletion";
import { EXPORT_TABLES } from "@/lib/export";

function mockDeleteClient(failTable?: string) {
  const requests: Array<{ table: string; column: string; value: string }> = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              requests.push({ table, column, value });
              return {
                error: table === failTable ? { message: "delete failed" } : null
              };
            }
          };
        }
      };
    }
  };

  return { client, requests };
}

type MockStorageEntry = {
  name: string;
  id?: string | null;
  metadata?: unknown;
};

function mockStorageClient({
  entriesByPath,
  failListPath,
  failRemove = false
}: {
  entriesByPath: Record<string, MockStorageEntry[]>;
  failListPath?: string;
  failRemove?: boolean;
}) {
  const listRequests: Array<{ path: string; limit?: number; offset?: number }> = [];
  const removeRequests: string[][] = [];
  const client = {
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("orbit-attachments");
        return {
          async list(path: string, options?: { limit?: number; offset?: number }) {
            listRequests.push({ path, limit: options?.limit, offset: options?.offset });
            if (path === failListPath) {
              return { data: null, error: { message: "list failed" } };
            }
            const rows = entriesByPath[path] ?? [];
            const offset = options?.offset ?? 0;
            const limit = options?.limit ?? rows.length;
            return { data: rows.slice(offset, offset + limit), error: null };
          },
          async remove(paths: string[]) {
            removeRequests.push(paths);
            return { error: failRemove ? { message: "remove failed" } : null };
          }
        };
      }
    }
  };

  return { client, listRequests, removeRequests };
}

describe("account deletion", () => {
  it("covers every owner-scoped export table with the same owner column", () => {
    const deletedByTable = Object.fromEntries(ACCOUNT_DELETE_TABLES.map((table) => [table.name, table.ownerColumn]));
    const exportedByTable = Object.fromEntries(EXPORT_TABLES.map((table) => [table.name, table.ownerColumn]));

    expect(deletedByTable).toEqual(exportedByTable);
  });

  it("deletes dependent tables before parent tables", () => {
    const order = ACCOUNT_DELETE_TABLES.map((table) => table.name);

    expect(order.indexOf("attachments")).toBeLessThan(order.indexOf("captures"));
    expect(order.indexOf("taggings")).toBeLessThan(order.indexOf("tags"));
    expect(order.indexOf("reminders")).toBeLessThan(order.indexOf("tasks"));
    expect(order.indexOf("focus_sessions")).toBeLessThan(order.indexOf("tasks"));
    expect(order.indexOf("grocery_items")).toBeLessThan(order.indexOf("meal_plans"));
    expect(order.indexOf("habit_logs")).toBeLessThan(order.indexOf("habits"));
    expect(order.indexOf("goal_milestones")).toBeLessThan(order.indexOf("goals"));
    expect(order.at(-1)).toBe("profiles");
  });

  it("deletes rows for the target user and reports table failures", async () => {
    const { client, requests } = mockDeleteClient();

    await deleteAccountRows(client, "user-1");

    expect(requests).toHaveLength(ACCOUNT_DELETE_TABLES.length);
    expect(requests.find((request) => request.table === "profiles")).toEqual({
      table: "profiles",
      column: "id",
      value: "user-1"
    });
    expect(requests.find((request) => request.table === "people")).toEqual({
      table: "people",
      column: "user_id",
      value: "user-1"
    });

    await expect(deleteAccountRows(mockDeleteClient("people").client, "user-1")).rejects.toThrow("people: delete failed");
  });

  it("rejects invalid account owner ids before deleting rows", async () => {
    const { client, requests } = mockDeleteClient();

    await expect(deleteAccountRows(client, "")).rejects.toThrow("Invalid account owner id.");
    await expect(deleteAccountRows(client, "user-1/nested")).rejects.toThrow("Invalid account owner id.");

    expect(requests).toEqual([]);
  });

  it("recursively removes all account storage objects", async () => {
    const { client, listRequests, removeRequests } = mockStorageClient({
      entriesByPath: {
        "user-1": [
          { name: "capture-1", id: null, metadata: null },
          { name: "root-file.png", id: "file-root", metadata: {} }
        ],
        "user-1/capture-1": [
          { name: "front.png", id: "file-front", metadata: {} },
          { name: "nested", id: null, metadata: null }
        ],
        "user-1/capture-1/nested": [{ name: "back.png", id: "file-back", metadata: {} }]
      }
    });

    await expect(deleteAccountStorageObjects(client, "user-1")).resolves.toBe(3);

    expect(listRequests.map((request) => request.path)).toEqual(["user-1", "user-1/capture-1", "user-1/capture-1/nested"]);
    expect(removeRequests).toEqual([["user-1/capture-1/front.png", "user-1/capture-1/nested/back.png", "user-1/root-file.png"]]);
  });

  it("paginates storage listings before removal", async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({ name: `file-${index}.png`, id: `file-${index}`, metadata: {} }));
    const { client, listRequests, removeRequests } = mockStorageClient({
      entriesByPath: {
        "user-1": entries
      }
    });

    await expect(deleteAccountStorageObjects(client, "user-1")).resolves.toBe(101);

    expect(listRequests).toEqual([
      { path: "user-1", limit: 100, offset: 0 },
      { path: "user-1", limit: 100, offset: 100 }
    ]);
    expect(removeRequests).toEqual([entries.slice(0, 100).map((entry) => `user-1/${entry.name}`), ["user-1/file-100.png"]]);
  });

  it("reports storage list and remove failures", async () => {
    await expect(
      deleteAccountStorageObjects(
        mockStorageClient({
          entriesByPath: {
            "user-1": []
          },
          failListPath: "user-1"
        }).client,
        "user-1"
      )
    ).rejects.toThrow("storage list user-1: list failed");

    await expect(
      deleteAccountStorageObjects(
        mockStorageClient({
          entriesByPath: {
            "user-1": [{ name: "file.png", id: "file", metadata: {} }]
          },
          failRemove: true
        }).client,
        "user-1"
      )
    ).rejects.toThrow("storage remove: remove failed");
  });

  it("rejects invalid account owner ids before listing storage", async () => {
    const { client, listRequests, removeRequests } = mockStorageClient({
      entriesByPath: {
        "": [{ name: "root-file.png", id: "file", metadata: {} }]
      }
    });

    await expect(deleteAccountStorageObjects(client, " ")).rejects.toThrow("Invalid account owner id.");
    await expect(deleteAccountStorageObjects(client, "user-1\\nested")).rejects.toThrow("Invalid account owner id.");

    expect(listRequests).toEqual([]);
    expect(removeRequests).toEqual([]);
  });
});
