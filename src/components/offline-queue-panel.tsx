"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, Download, FileText, Image, LinkIcon, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { ModuleCard } from "@/components/module-card";
import { downloadJson } from "@/lib/export";
import { buildOfflineQueueExportPayload, parseOfflineQueueExportPayload } from "@/lib/offline-queue-export";
import { flushQueuedCaptures, OFFLINE_QUEUE_CHANGED_EVENT, readQueuedCaptures, removeQueuedCapture, restoreQueuedCaptures, type OfflineCaptureDraft } from "@/lib/offline-queue";

export function OfflineQueuePanel({ userId }: { userId: string }) {
  const [queuedCaptures, setQueuedCaptures] = useState<OfflineCaptureDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refreshQueue = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setQueuedCaptures(await readQueuedCaptures());
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Offline queue could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function refreshOnlineStatus() {
      setOnline(navigator.onLine);
    }

    refreshOnlineStatus();
    void refreshQueue();
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshQueue);
    window.addEventListener("online", refreshQueue);
    window.addEventListener("online", refreshOnlineStatus);
    window.addEventListener("offline", refreshOnlineStatus);

    return () => {
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshQueue);
      window.removeEventListener("online", refreshQueue);
      window.removeEventListener("online", refreshOnlineStatus);
      window.removeEventListener("offline", refreshOnlineStatus);
    };
  }, [refreshQueue]);

  async function syncQueue() {
    setSyncing(true);
    setMessage(null);
    setError(null);

    try {
      const syncedCount = await flushQueuedCaptures(userId);
      await refreshQueue();
      setMessage(syncedCount > 0 ? `${syncedCount} queued capture${syncedCount === 1 ? "" : "s"} synced.` : "No queued captures were ready to sync.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Offline queue could not be synced.");
    } finally {
      setSyncing(false);
    }
  }

  async function discardCapture(id: string) {
    setRemovingId(id);
    setMessage(null);
    setError(null);

    try {
      await removeQueuedCapture(id);
      await refreshQueue();
      setMessage("Queued capture discarded.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Queued capture could not be discarded.");
    } finally {
      setRemovingId(null);
    }
  }

  async function exportQueue() {
    setExporting(true);
    setMessage(null);
    setError(null);

    try {
      const payload = await buildOfflineQueueExportPayload(userId, queuedCaptures);
      downloadJson(`orbit-offline-queue-${new Date().toISOString().slice(0, 10)}.json`, payload);
      setMessage(`Exported ${payload.summary.captures} queued capture${payload.summary.captures === 1 ? "" : "s"} and ${payload.summary.files} file${payload.summary.files === 1 ? "" : "s"}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Offline queue could not be exported.");
    } finally {
      setExporting(false);
    }
  }

  async function importQueueExport(file: File | undefined) {
    if (!file) return;

    setImporting(true);
    setMessage(null);
    setError(null);

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const drafts = parseOfflineQueueExportPayload(payload, { userId });
      const restoredCount = await restoreQueuedCaptures(drafts);
      await refreshQueue();
      setMessage(
        restoredCount > 0
          ? `Restored ${restoredCount} queued capture${restoredCount === 1 ? "" : "s"}.`
          : "No queued captures were found in that rescue copy."
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Offline queue rescue copy could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  const count = queuedCaptures.length;

  return (
    <ModuleCard
      title="Offline queue"
      kicker={loading ? "Checking queued captures..." : count === 0 ? "No offline captures waiting." : `${count} capture${count === 1 ? "" : "s"} waiting`}
      action={
        <button className="icon-button" type="button" onClick={refreshQueue} disabled={loading} aria-label="Refresh offline queue">
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      }
    >
      <div className="section-stack">
        <div className="notice">Offline links, notes, and screenshots stay on this device until they sync.</div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        {message ? (
          <div className={message.includes("synced") || message.includes("discarded") || message.includes("Exported") || message.includes("Restored") ? "success" : "notice"} role="status">
            {message}
          </div>
        ) : null}
        {!online && count > 0 ? <div className="notice">Reconnect this device to sync queued captures.</div> : null}
        <div className="row-actions offline-queue-actions">
          {count > 0 ? (
            <button className="button primary" type="button" onClick={syncQueue} disabled={syncing || !online}>
              {syncing ? <Loader2 size={16} aria-hidden="true" /> : <CloudUpload size={16} aria-hidden="true" />}
              {syncing ? "Syncing" : "Sync queued captures"}
            </button>
          ) : null}
          {count > 0 ? (
            <button className="button" type="button" onClick={exportQueue} disabled={exporting}>
              {exporting ? <Loader2 size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {exporting ? "Exporting" : "Export rescue copy"}
            </button>
          ) : null}
          <button className="button" type="button" onClick={() => importInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            {importing ? "Restoring" : "Import rescue copy"}
          </button>
          <input
            ref={importInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            disabled={importing}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void importQueueExport(file);
            }}
          />
        </div>
        {loading ? <div className="skeleton skeleton-queue" /> : null}
        {!loading && count === 0 ? <div className="empty-state">The queue is clear on this device.</div> : null}
        {!loading && count > 0 ? (
          <div className="list">
            {queuedCaptures.map((capture) => (
              <QueuedCaptureRow key={capture.id} capture={capture} removing={removingId === capture.id} onDiscard={() => void discardCapture(capture.id)} />
            ))}
          </div>
        ) : null}
      </div>
    </ModuleCard>
  );
}

function QueuedCaptureRow({
  capture,
  removing,
  onDiscard
}: {
  capture: OfflineCaptureDraft;
  removing: boolean;
  onDiscard: () => void;
}) {
  const Icon = capture.type === "screenshot" ? Image : capture.type === "link" ? LinkIcon : FileText;
  const fileCount = capture.files?.length ?? 0;
  const meta = [
    capture.type,
    new Date(capture.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : null,
    capture.tag_names.length ? capture.tag_names.map((tag) => `#${tag}`).join(" ") : null
  ].filter(Boolean);

  return (
    <div className="list-row offline-queue-row">
      <Icon size={17} aria-hidden="true" />
      <div className="row-main">
        <p className="row-title">{capture.title || capture.url || "Untitled capture"}</p>
        <p className="row-meta">{meta.join(" · ")}</p>
        {capture.url ? <p className="row-meta">{capture.url}</p> : null}
      </div>
      <button className="cadence-button" type="button" onClick={onDiscard} disabled={removing}>
        {removing ? <Loader2 size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
        Discard
      </button>
    </div>
  );
}
