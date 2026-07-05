"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudUpload, Loader2, WifiOff } from "lucide-react";
import { flushQueuedCaptures, OFFLINE_QUEUE_CHANGED_EVENT, readQueuedCaptures } from "@/lib/offline-queue";
import { offlineStatusCopy, offlineStatusTone, shouldShowOfflineStatus, type OfflineStatus } from "@/lib/offline-status";

type SyncFeedback = {
  tone: "success" | "error";
  message: string;
};

async function readOfflineStatus(): Promise<OfflineStatus> {
  const online = navigator.onLine;

  try {
    const queuedCaptures = await readQueuedCaptures();
    return { online, queuedCount: queuedCaptures.length, queueReadable: true };
  } catch {
    return { online, queuedCount: 0, queueReadable: false };
  }
}

export function OfflineStatusBanner({ userId }: { userId: string }) {
  const [status, setStatus] = useState<OfflineStatus>({
    online: true,
    queuedCount: 0,
    queueReadable: true
  });
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await readOfflineStatus();
    setStatus(nextStatus);
    return nextStatus;
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      const nextStatus = await readOfflineStatus();
      if (mounted) setStatus(nextStatus);
    }

    function scheduleRefresh() {
      setFeedback(null);
      void refresh();
    }

    scheduleRefresh();
    window.addEventListener("online", scheduleRefresh);
    window.addEventListener("offline", scheduleRefresh);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, scheduleRefresh);
    document.addEventListener("visibilitychange", scheduleRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("online", scheduleRefresh);
      window.removeEventListener("offline", scheduleRefresh);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, scheduleRefresh);
      document.removeEventListener("visibilitychange", scheduleRefresh);
    };
  }, []);

  if (!shouldShowOfflineStatus(status)) return null;

  const tone = offlineStatusTone(status);
  const Icon = status.online ? CloudUpload : WifiOff;
  const copy = offlineStatusCopy(status);
  const canSyncNow = status.online && status.queueReadable && status.queuedCount > 0;

  async function handleSyncNow() {
    if (!canSyncNow || syncing) return;

    setFeedback(null);
    setSyncing(true);

    try {
      const syncedCount = await flushQueuedCaptures(userId);
      const nextStatus = await refreshStatus();

      if (!nextStatus.queueReadable) {
        setFeedback({ tone: "error", message: "Local capture storage could not be read on this device." });
      } else if (nextStatus.queuedCount > 0) {
        setFeedback({ tone: "error", message: "Orbit could not sync the queue yet. It will retry when the connection is stable." });
      } else if (syncedCount > 0) {
        setFeedback({
          tone: "success",
          message: `${syncedCount} offline capture${syncedCount === 1 ? "" : "s"} synced.`
        });
      } else {
        setFeedback({ tone: "success", message: "Offline queue is already clear." });
      }
    } catch {
      setFeedback({ tone: "error", message: "Offline captures could not be synced. Try again when the connection is stable." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className={`app-status-banner ${tone}`} role="status" aria-live="polite">
      <Icon size={16} aria-hidden="true" />
      <div className="app-status-copy">
        <p className="app-status-title">{copy.title}</p>
        <p className={feedback ? `app-status-detail ${feedback.tone}` : "app-status-detail"}>
          {feedback?.message ?? copy.detail}
        </p>
      </div>
      {canSyncNow ? (
        <button className="cadence-button app-status-action" type="button" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? <Loader2 className="status-spinner" size={14} aria-hidden="true" /> : <CloudUpload size={14} aria-hidden="true" />}
          {syncing ? "Syncing" : "Sync now"}
        </button>
      ) : null}
    </div>
  );
}
