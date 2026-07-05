const DB_NAME = "orbit-share-target";
const STORE_NAME = "shared-captures";
const VERSION = 1;

export type StoredSharedCapture = {
  id: string;
  title: string;
  text: string;
  url: string;
  files: File[];
  createdAt: number;
};

function canUseShareTargetStore() {
  return typeof indexedDB !== "undefined";
}

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSharedCapture(id: string) {
  if (!canUseShareTargetStore()) return null;

  const db = await openShareDb();
  const payload = await new Promise<StoredSharedCapture | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredSharedCapture | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return payload ?? null;
}

export async function removeSharedCapture(id: string) {
  if (!canUseShareTargetStore()) return;

  const db = await openShareDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
