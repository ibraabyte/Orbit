import type { SupabaseClient } from "@supabase/supabase-js";
import { assertCaptureImageFilesWithinLimits } from "@/lib/capture-files";
import type { CaptureType, DashboardData, Database } from "@/lib/types";
import { getSupabase } from "@/lib/supabase";
import { saveOnlineCapture } from "@/lib/capture-save";

const DB_NAME = "orbit-offline";
const CAPTURE_QUEUE_STORE = "capture-queue";
const DASHBOARD_CACHE_STORE = "dashboard-cache";
const VERSION = 2;

export const OFFLINE_QUEUE_CHANGED_EVENT = "orbit-offline-queue-changed";

export type OfflineCaptureDraft = {
  id: string;
  type: CaptureType;
  title: string;
  url: string | null;
  note: string | null;
  tag_names: string[];
  files?: File[];
  created_at: string;
};

export type CachedDashboard = {
  userId: string;
  data: DashboardData;
  cachedAt: string;
};

let queuedCaptureFlush: Promise<number> | null = null;

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_QUEUE_STORE)) {
        db.createObjectStore(CAPTURE_QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DASHBOARD_CACHE_STORE)) {
        db.createObjectStore(DASHBOARD_CACHE_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineCapture(draft: Omit<OfflineCaptureDraft, "id" | "created_at">) {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline storage is unavailable in this browser.");
  }

  assertCaptureImageFilesWithinLimits(draft.files ?? []);

  const db = await openQueueDb();
  const payload: OfflineCaptureDraft = {
    ...draft,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAPTURE_QUEUE_STORE, "readwrite");
    tx.objectStore(CAPTURE_QUEUE_STORE).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  notifyOfflineQueueChanged();
  return payload;
}

export async function readQueuedCaptures() {
  if (typeof indexedDB === "undefined") return [];
  const db = await openQueueDb();
  const rows = await new Promise<OfflineCaptureDraft[]>((resolve, reject) => {
    const tx = db.transaction(CAPTURE_QUEUE_STORE, "readonly");
    const request = tx.objectStore(CAPTURE_QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as OfflineCaptureDraft[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return rows;
}

export async function removeQueuedCapture(id: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAPTURE_QUEUE_STORE, "readwrite");
    tx.objectStore(CAPTURE_QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyOfflineQueueChanged();
}

export async function restoreQueuedCaptures(drafts: OfflineCaptureDraft[]) {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline storage is unavailable in this browser.");
  }

  if (!drafts.length) return 0;

  for (const draft of drafts) {
    assertCaptureImageFilesWithinLimits(draft.files ?? []);
  }

  const restoredDrafts = prepareQueuedCaptureRestore(drafts, await readQueuedCaptures()).drafts;
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAPTURE_QUEUE_STORE, "readwrite");
    const store = tx.objectStore(CAPTURE_QUEUE_STORE);

    for (const draft of restoredDrafts) {
      store.put(draft);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  notifyOfflineQueueChanged();
  return restoredDrafts.length;
}

export function prepareQueuedCaptureRestore(
  drafts: OfflineCaptureDraft[],
  existingDrafts: OfflineCaptureDraft[],
  createId: () => string = () => crypto.randomUUID()
) {
  const usedIds = new Set(existingDrafts.map((draft) => draft.id));
  let renamedCount = 0;

  return {
    drafts: drafts.map((draft) => {
      if (!usedIds.has(draft.id)) {
        usedIds.add(draft.id);
        return draft;
      }

      let id = createId();
      while (usedIds.has(id)) {
        id = createId();
      }

      usedIds.add(id);
      renamedCount += 1;
      return { ...draft, id };
    }),
    renamedCount
  };
}

export async function flushQueuedCaptures(userId: string) {
  queuedCaptureFlush ??= flushQueuedCapturesOnce(userId).finally(() => {
    queuedCaptureFlush = null;
  });
  return queuedCaptureFlush;
}

async function flushQueuedCapturesOnce(userId: string) {
  if (typeof indexedDB === "undefined" || !navigator.onLine) return 0;
  const queued = await readQueuedCaptures();
  if (!queued.length) return 0;

  const supabase = getSupabase();
  let flushed = 0;

  for (const draft of queued) {
    if (await syncQueuedCaptureDraft(userId, draft, supabase)) {
      await removeQueuedCapture(draft.id);
      flushed += 1;
    }
  }

  return flushed;
}

export async function syncQueuedCaptureDraft(
  userId: string,
  draft: OfflineCaptureDraft,
  supabase: SupabaseClient<Database> = getSupabase()
) {
  try {
    await saveOnlineCapture(
      {
        userId,
        type: draft.type,
        title: draft.title,
        url: draft.url,
        note: draft.note,
        tagNames: draft.tag_names,
        files: draft.files,
        createdAt: draft.created_at
      },
      supabase
    );
    return true;
  } catch {
    return false;
  }
}

export async function saveDashboardCache(userId: string, data: DashboardData) {
  if (typeof indexedDB === "undefined") return;
  const db = await openQueueDb();
  const payload: CachedDashboard = {
    userId,
    data,
    cachedAt: new Date().toISOString()
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DASHBOARD_CACHE_STORE, "readwrite");
    tx.objectStore(DASHBOARD_CACHE_STORE).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCachedDashboard(userId: string) {
  if (typeof indexedDB === "undefined") return null;
  const db = await openQueueDb();
  const payload = await new Promise<CachedDashboard | undefined>((resolve, reject) => {
    const tx = db.transaction(DASHBOARD_CACHE_STORE, "readonly");
    const request = tx.objectStore(DASHBOARD_CACHE_STORE).get(userId);
    request.onsuccess = () => resolve(request.result as CachedDashboard | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return payload ?? null;
}

function notifyOfflineQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}
