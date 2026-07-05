import { afterEach, describe, expect, it } from "vitest";
import {
  backupHealthStorageKey,
  backupHealthStorageKeyPrefix,
  clearStoredBackupHealth,
  loadBackupHealth,
  saveBackupHealth,
  summarizeBackupHealth
} from "@/lib/backup-health";

afterEach(() => {
  localStorage.clear();
});

describe("backup health", () => {
  it("stores and loads the last successful full backup for the current user", () => {
    const record = {
      userId: "user-1",
      exportedAt: "2026-07-01T10:00:00.000Z",
      recordCount: 1234,
      attachmentFileCount: 2
    };

    expect(saveBackupHealth(record, localStorage)).toBe(true);

    expect(loadBackupHealth("user-1", localStorage)).toEqual(record);
    expect(loadBackupHealth("user-2", localStorage)).toBeNull();
  });

  it("ignores invalid stored records", () => {
    localStorage.setItem(backupHealthStorageKey("user-1"), JSON.stringify({ userId: "user-1", exportedAt: 123, recordCount: -1 }));

    expect(loadBackupHealth("user-1", localStorage)).toBeNull();
  });

  it("summarizes missing, current, aging, and overdue backup states", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");

    expect(summarizeBackupHealth(null, now)).toMatchObject({
      tone: "warning",
      title: "No full backup recorded"
    });
    expect(
      summarizeBackupHealth(
        { userId: "user-1", exportedAt: "2026-07-31T08:00:00.000Z", recordCount: 1, attachmentFileCount: 1 },
        now
      )
    ).toEqual({
      tone: "success",
      title: "Full backup is current",
      detail: "Last full backup was today with 1 record and 1 attachment file."
    });
    expect(
      summarizeBackupHealth(
        { userId: "user-1", exportedAt: "2026-07-10T08:00:00.000Z", recordCount: 1234, attachmentFileCount: 0 },
        now
      )
    ).toEqual({
      tone: "warning",
      title: "Full backup is aging",
      detail: "Last full backup was 21 days ago with 1,234 records and 0 attachment files."
    });
    expect(
      summarizeBackupHealth(
        { userId: "user-1", exportedAt: "2026-06-30T12:00:00.000Z", recordCount: 2, attachmentFileCount: 3 },
        now
      )
    ).toEqual({
      tone: "danger",
      title: "Full backup is overdue",
      detail: "Last full backup was 31 days ago with 2 records and 3 attachment files."
    });
  });

  it("clears stored backup health without touching unrelated local storage keys", () => {
    localStorage.setItem(backupHealthStorageKey("user-1"), "{}");
    localStorage.setItem(`${backupHealthStorageKeyPrefix}legacy-user`, "{}");
    localStorage.setItem("supabase.auth.token", "preserve");

    expect(clearStoredBackupHealth(localStorage)).toEqual([`${backupHealthStorageKeyPrefix}legacy-user`, backupHealthStorageKey("user-1")]);
    expect(localStorage.getItem(backupHealthStorageKey("user-1"))).toBeNull();
    expect(localStorage.getItem("supabase.auth.token")).toBe("preserve");
  });
});
