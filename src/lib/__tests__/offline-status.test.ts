import { describe, expect, it } from "vitest";
import { offlineStatusCopy, offlineStatusTone, shouldShowOfflineStatus } from "@/lib/offline-status";

describe("offline app status", () => {
  it("stays hidden when the app is online and nothing is queued", () => {
    expect(shouldShowOfflineStatus({ online: true, queuedCount: 0, queueReadable: true })).toBe(false);
  });

  it("explains offline mode without queued captures", () => {
    const status = { online: false, queuedCount: 0, queueReadable: true };

    expect(shouldShowOfflineStatus(status)).toBe(true);
    expect(offlineStatusTone(status)).toBe("warning");
    expect(offlineStatusCopy(status)).toEqual({
      title: "Offline",
      detail: "Recently opened pages and the cached dashboard can still load."
    });
  });

  it("summarizes queued captures while offline", () => {
    expect(offlineStatusCopy({ online: false, queuedCount: 2, queueReadable: true })).toEqual({
      title: "Offline",
      detail: "2 captures waiting to sync when you reconnect."
    });
  });

  it("summarizes queued captures while online", () => {
    expect(offlineStatusCopy({ online: true, queuedCount: 1, queueReadable: true })).toEqual({
      title: "Offline captures waiting",
      detail: "1 capture waiting to sync."
    });
  });

  it("warns when local queue storage cannot be read", () => {
    const status = { online: true, queuedCount: 0, queueReadable: false };

    expect(offlineStatusTone(status)).toBe("danger");
    expect(offlineStatusCopy(status)).toEqual({
      title: "Offline queue unavailable",
      detail: "Local capture storage could not be read on this device."
    });
  });
});
