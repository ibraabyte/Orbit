import { afterEach, describe, expect, it, vi } from "vitest";
import { backupHealthStorageKey } from "@/lib/backup-health";
import { clearOrbitPersonalBrowserState } from "@/lib/client-storage";
import { launchQaEvidenceStorageKey, launchQaStorageKey } from "@/lib/launch-qa";

const originalCaches = globalThis.caches;
const originalIndexedDb = globalThis.indexedDB;

afterEach(() => {
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: originalCaches
  });
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: originalIndexedDb
  });
  localStorage.clear();
});

describe("client storage cleanup", () => {
  it("clears personal Orbit browser state while preserving the current shell cache", async () => {
    const deletedCaches: string[] = [];
    const deletedDatabases: string[] = [];

    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        keys: vi.fn(async () => ["orbit-pages-v1", "orbit-shell-v4", "orbit-shell-v5", "external-cache"]),
        delete: vi.fn(async (name: string) => {
          deletedCaches.push(name);
          return true;
        })
      }
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        deleteDatabase(name: string) {
          deletedDatabases.push(name);
          const request: IDBOpenDBRequest = {} as IDBOpenDBRequest;
          queueMicrotask(() => request.onsuccess?.({} as Event));
          return request;
        }
      }
    });
    localStorage.setItem(launchQaStorageKey, "{\"desktop-pwa-install\":true}");
    localStorage.setItem(launchQaEvidenceStorageKey, "{\"desktop-pwa-install\":{\"note\":\"Chrome desktop\"}}");
    localStorage.setItem(backupHealthStorageKey("user-1"), "{\"userId\":\"user-1\"}");
    localStorage.setItem("supabase.auth.token", "leave auth library cleanup alone");

    const result = await clearOrbitPersonalBrowserState();

    expect(deletedCaches).toEqual(["orbit-pages-v1", "orbit-shell-v4"]);
    expect(deletedDatabases).toEqual(["orbit-offline", "orbit-share-target"]);
    expect(result).toEqual({
      cachesDeleted: ["orbit-pages-v1", "orbit-shell-v4"],
      databasesDeleted: ["orbit-offline", "orbit-share-target"],
      localStorageKeysRemoved: [launchQaStorageKey, launchQaEvidenceStorageKey, backupHealthStorageKey("user-1")]
    });
    expect(localStorage.getItem(launchQaStorageKey)).toBeNull();
    expect(localStorage.getItem(launchQaEvidenceStorageKey)).toBeNull();
    expect(localStorage.getItem(backupHealthStorageKey("user-1"))).toBeNull();
    expect(localStorage.getItem("supabase.auth.token")).toBe("leave auth library cleanup alone");
  });
});
