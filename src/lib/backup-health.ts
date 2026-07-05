export const backupHealthStorageKeyPrefix = "orbit:backup-health:";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FRESH_BACKUP_DAYS = 14;
const OVERDUE_BACKUP_DAYS = 30;

export type BackupHealthRecord = {
  userId: string;
  exportedAt: string;
  recordCount: number;
  attachmentFileCount: number;
};

export type BackupHealthSummary = {
  tone: "success" | "warning" | "danger";
  title: string;
  detail: string;
};

type BackupHealthStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function backupHealthStorageKey(userId: string) {
  return `${backupHealthStorageKeyPrefix}${encodeURIComponent(userId)}`;
}

export function loadBackupHealth(userId: string, storage: BackupHealthStorage | null = browserLocalStorage()) {
  if (!storage) return null;

  try {
    const raw = storage.getItem(backupHealthStorageKey(userId));
    if (!raw) return null;
    return parseBackupHealthRecord(JSON.parse(raw), userId);
  } catch {
    return null;
  }
}

export function saveBackupHealth(record: BackupHealthRecord, storage: BackupHealthStorage | null = browserLocalStorage()) {
  if (!storage) return false;

  try {
    storage.setItem(backupHealthStorageKey(record.userId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBackupHealth(storage: BackupHealthStorage | null = browserLocalStorage()) {
  if (!storage) return [];

  const removed: string[] = [];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key?.startsWith(backupHealthStorageKeyPrefix)) continue;
    storage.removeItem(key);
    removed.push(key);
  }

  return removed.sort();
}

export function summarizeBackupHealth(record: BackupHealthRecord | null, now = new Date()): BackupHealthSummary {
  if (!record) {
    return {
      tone: "warning",
      title: "No full backup recorded",
      detail: "Export a full backup after setup and before major changes. This reminder is stored only on this browser."
    };
  }

  const exportedAt = Date.parse(record.exportedAt);
  if (!Number.isFinite(exportedAt)) {
    return {
      tone: "warning",
      title: "Backup status needs refresh",
      detail: "Export again so Orbit can track the last successful full backup on this browser."
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - exportedAt) / MS_PER_DAY));
  const detail = `Last full backup was ${relativeBackupAge(ageDays)} with ${formatCount(record.recordCount, "record")} and ${formatCount(record.attachmentFileCount, "attachment file")}.`;

  if (ageDays > OVERDUE_BACKUP_DAYS) {
    return {
      tone: "danger",
      title: "Full backup is overdue",
      detail
    };
  }

  if (ageDays > FRESH_BACKUP_DAYS) {
    return {
      tone: "warning",
      title: "Full backup is aging",
      detail
    };
  }

  return {
    tone: "success",
    title: "Full backup is current",
    detail
  };
}

function parseBackupHealthRecord(value: unknown, userId: string): BackupHealthRecord | null {
  if (!isRecord(value)) return null;
  if (value.userId !== userId) return null;
  if (typeof value.exportedAt !== "string") return null;
  if (typeof value.recordCount !== "number" || !Number.isFinite(value.recordCount) || value.recordCount < 0) return null;
  if (typeof value.attachmentFileCount !== "number" || !Number.isFinite(value.attachmentFileCount) || value.attachmentFileCount < 0) return null;

  return {
    userId: value.userId,
    exportedAt: value.exportedAt,
    recordCount: value.recordCount,
    attachmentFileCount: value.attachmentFileCount
  };
}

function relativeBackupAge(ageDays: number) {
  if (ageDays === 0) return "today";
  if (ageDays === 1) return "yesterday";
  return `${ageDays} days ago`;
}

function formatCount(count: number, label: string) {
  return `${count.toLocaleString("en-US")} ${label}${count === 1 ? "" : "s"}`;
}

function browserLocalStorage(): BackupHealthStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
