import { clearStoredBackupHealth } from "@/lib/backup-health";
import { launchQaEvidenceStorageKey, launchQaStorageKey } from "@/lib/launch-qa";

const CURRENT_SHELL_CACHE = "orbit-shell-v5";
const PERSONAL_CACHE_NAMES = ["orbit-pages-v1"];
const LEGACY_PERSONAL_CACHE_PREFIXES = ["orbit-shell-v"];
const ORBIT_INDEXED_DATABASES = ["orbit-offline", "orbit-share-target"];
const ORBIT_LOCAL_STORAGE_KEYS = [launchQaStorageKey, launchQaEvidenceStorageKey];

export type BrowserStateCleanupResult = {
  cachesDeleted: string[];
  databasesDeleted: string[];
  localStorageKeysRemoved: string[];
};

export async function clearOrbitPersonalBrowserState(): Promise<BrowserStateCleanupResult> {
  const [cachesDeleted, databasesDeleted] = await Promise.all([clearPersonalCaches(), clearPersonalDatabases()]);
  const localStorageKeysRemoved = clearLocalStorageKeys();

  return {
    cachesDeleted,
    databasesDeleted,
    localStorageKeysRemoved
  };
}

async function clearPersonalCaches() {
  if (typeof caches === "undefined") return [];

  try {
    const cacheNames = await caches.keys();
    const personalCaches = cacheNames.filter((name) => PERSONAL_CACHE_NAMES.includes(name) || isLegacyPersonalCache(name));
    const results = await Promise.all(personalCaches.map(async (name) => ((await caches.delete(name)) ? name : null)));
    return results.filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

function isLegacyPersonalCache(name: string) {
  return name !== CURRENT_SHELL_CACHE && LEGACY_PERSONAL_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

async function clearPersonalDatabases() {
  if (typeof indexedDB === "undefined") return [];

  const results = await Promise.all(ORBIT_INDEXED_DATABASES.map((name) => deleteDatabase(name)));
  return results.filter((name): name is string => Boolean(name));
}

function deleteDatabase(name: string) {
  return new Promise<string | null>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve(name);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function clearLocalStorageKeys() {
  if (typeof localStorage === "undefined") return [];

  const removed: string[] = [];

  for (const key of ORBIT_LOCAL_STORAGE_KEYS) {
    if (localStorage.getItem(key) === null) continue;
    localStorage.removeItem(key);
    removed.push(key);
  }

  return [...removed, ...clearStoredBackupHealth(localStorage)].sort();
}
