"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, RefreshCw, RotateCcw } from "lucide-react";
import { ModuleCard } from "@/components/module-card";
import { downloadText } from "@/lib/export";
import { getSupabase, hasSupabaseEnv } from "@/lib/supabase";
import {
  buildLaunchQaReport,
  launchQaEvidenceStorageKey,
  launchQaCompletionLabel,
  launchQaStorageKey,
  normalizeLaunchQaEvidence,
  normalizeLaunchQaStatus,
  summarizeLaunchQaGate,
  summarizeLaunchQaEvidence,
  summarizeLaunchQaGroups,
  type LaunchQaEvidence,
  type LaunchQaStatus
} from "@/lib/launch-qa";
import { readQueuedCaptures } from "@/lib/offline-queue";
import {
  buildLaunchChecklist,
  buildReadinessItems,
  readinessBadgeClass,
  readinessLabel,
  summarizeReadiness,
  type LaunchChecklistItem,
  type ReadinessItem,
  type ReadinessSnapshot
} from "@/lib/readiness";

const checkingItems: ReadinessItem[] = [
  { id: "network", label: "Network", detail: "Checking connection.", state: "checking" },
  { id: "secure-context", label: "Secure context", detail: "Checking browser security context.", state: "checking" },
  { id: "install", label: "Install mode", detail: "Checking display mode.", state: "checking" },
  { id: "service-worker", label: "Service worker", detail: "Checking registration.", state: "checking" },
  { id: "offline", label: "Offline shell", detail: "Checking cache.", state: "checking" },
  { id: "app-shell-cache", label: "App shell assets", detail: "Checking cached shell assets.", state: "checking" },
  { id: "offline-queue", label: "Offline capture queue", detail: "Checking local storage.", state: "checking" },
  { id: "push", label: "Push reminders", detail: "Checking support.", state: "checking" },
  { id: "manifest", label: "Manifest", detail: "Checking manifest.", state: "checking" },
  { id: "export", label: "Backup download", detail: "Checking download APIs.", state: "checking" },
  { id: "server-supabase", label: "Supabase client", detail: "Checking server configuration.", state: "checking" },
  { id: "server-admin", label: "Server admin", detail: "Checking server configuration.", state: "checking" },
  { id: "server-push", label: "Push sender", detail: "Checking server configuration.", state: "checking" },
  { id: "server-cron", label: "Cron guard", detail: "Checking server configuration.", state: "checking" }
];

const appShellAssets = ["/offline.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

export function DeviceReadinessPanel() {
  const [items, setItems] = useState<ReadinessItem[]>(checkingItems);
  const [checking, setChecking] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [launchQaStatus, setLaunchQaStatus] = useState<LaunchQaStatus>({});
  const [launchQaEvidence, setLaunchQaEvidence] = useState<LaunchQaEvidence>({});
  const [qaReportState, setQaReportState] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    const [snapshot, serverItems] = await Promise.all([collectReadinessSnapshot(), loadServerReadinessItems()]);
    setItems([...buildReadinessItems(snapshot), ...serverItems]);
    setCheckedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setChecking(false);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    const rawStatus = window.localStorage.getItem(launchQaStorageKey);
    const rawEvidence = window.localStorage.getItem(launchQaEvidenceStorageKey);

    if (rawStatus) {
      try {
        setLaunchQaStatus(normalizeLaunchQaStatus(JSON.parse(rawStatus)));
      } catch {
        setLaunchQaStatus({});
      }
    }

    if (rawEvidence) {
      try {
        setLaunchQaEvidence(normalizeLaunchQaEvidence(JSON.parse(rawEvidence)));
      } catch {
        setLaunchQaEvidence({});
      }
    }
  }, []);

  function setLaunchQaStep(stepId: string, checked: boolean) {
    const nextStatus = normalizeLaunchQaStatus({ ...launchQaStatus, [stepId]: checked });
    const nextEvidence = normalizeLaunchQaEvidence({
      ...launchQaEvidence,
      [stepId]: {
        ...launchQaEvidence[stepId],
        checkedAt: checked ? launchQaEvidence[stepId]?.checkedAt ?? new Date().toISOString() : undefined
      }
    });
    setLaunchQaStatus(nextStatus);
    setLaunchQaEvidence(nextEvidence);
    window.localStorage.setItem(launchQaStorageKey, JSON.stringify(nextStatus));
    persistLaunchQaEvidence(nextEvidence);
    setQaReportState(null);
  }

  function setLaunchQaEvidenceNote(stepId: string, note: string) {
    const nextEvidence = normalizeLaunchQaEvidence({
      ...launchQaEvidence,
      [stepId]: {
        ...launchQaEvidence[stepId],
        note
      }
    });
    setLaunchQaEvidence(nextEvidence);
    persistLaunchQaEvidence(nextEvidence);
    setQaReportState(null);
  }

  function resetLaunchQa() {
    setLaunchQaStatus({});
    setLaunchQaEvidence({});
    window.localStorage.removeItem(launchQaStorageKey);
    window.localStorage.removeItem(launchQaEvidenceStorageKey);
    setQaReportState(null);
  }

  function buildCurrentLaunchQaReport() {
    const launchItems = buildLaunchChecklist(items);
    return buildLaunchQaReport(launchQaStatus, {
      automatedCheckSections: [
        { title: "Device readiness", items },
        { title: "Launch checklist", items: launchItems }
      ],
      evidence: launchQaEvidence
    });
  }

  async function copyLaunchQaReport() {
    const report = buildCurrentLaunchQaReport();

    if (!navigator.clipboard) {
      setQaReportState("Copy is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(report);
      setQaReportState("Launch report copied.");
      window.setTimeout(() => setQaReportState(null), 1600);
    } catch {
      setQaReportState("Copy failed.");
    }
  }

  function downloadLaunchQaReport() {
    try {
      downloadText(`orbit-launch-qa-${new Date().toISOString().slice(0, 10)}.md`, buildCurrentLaunchQaReport(), "text/markdown;charset=utf-8");
      setQaReportState("Launch report downloaded.");
      window.setTimeout(() => setQaReportState(null), 1600);
    } catch {
      setQaReportState("Download failed.");
    }
  }

  const summary = summarizeReadiness(items);
  const launchItems = buildLaunchChecklist(items);
  const launchSummary = summarizeReadiness(launchItems);
  const qaGroups = summarizeLaunchQaGroups(launchQaStatus);
  const qaEvidenceSummary = summarizeLaunchQaEvidence(launchQaStatus, launchQaEvidence);
  const qaGate = summarizeLaunchQaGate(launchQaStatus, launchQaEvidence);
  const nextQaStep = qaGate.nextStep;
  const qaEvidenceLabel = qaEvidenceSummary.checked ? ` · ${qaEvidenceSummary.withEvidence}/${qaEvidenceSummary.checked} evidenced` : "";
  const qaKicker = `${launchQaCompletionLabel(launchQaStatus)}${qaEvidenceLabel} · ${qaGate.ready ? "gate clear" : "gate open"}`;

  return (
    <>
      <ModuleCard
        title="Device readiness"
        kicker={checkedAt ? `${summary.ready}/${summary.total} ready · checked ${checkedAt}` : "Checking this browser and server."}
        action={
          <button className="icon-button" type="button" onClick={refresh} disabled={checking} aria-label="Refresh readiness">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        }
      >
        <ReadinessList items={items} />
      </ModuleCard>
      <ModuleCard title="Launch checklist" kicker={`${launchSummary.ready}/${launchSummary.total} ready for production use`}>
        <ReadinessList items={launchItems} />
      </ModuleCard>
      <ModuleCard
        title="Production QA"
        kicker={qaKicker}
        action={
          <div className="row-actions">
            <button className="icon-button" type="button" onClick={copyLaunchQaReport} aria-label="Copy production QA report">
              <Copy size={16} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={downloadLaunchQaReport} aria-label="Download production QA report">
              <Download size={16} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={resetLaunchQa} aria-label="Reset production QA checklist">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        }
      >
        <div className="section-stack">
          <div className={qaGate.ready ? "notice success" : "notice"}>
            <strong>{qaGate.label}:</strong> {qaGate.detail}
          </div>
          {nextQaStep ? (
            <div className="notice">
              <strong>Next:</strong> {nextQaStep.label} · {nextQaStep.detail}
            </div>
          ) : qaEvidenceSummary.checkedWithoutEvidence > 0 ? (
            <div className="notice">
              <strong>Evidence needed:</strong> All items are checked, but {qaEvidenceSummary.checkedWithoutEvidence} checked item
              {qaEvidenceSummary.checkedWithoutEvidence === 1 ? "" : "s"} still need evidence notes.
            </div>
          ) : (
            null
          )}
          {nextQaStep && qaEvidenceSummary.checkedWithoutEvidence > 0 ? (
            <div className="notice">
              <strong>Evidence gaps:</strong> {qaEvidenceSummary.checkedWithoutEvidence} checked item
              {qaEvidenceSummary.checkedWithoutEvidence === 1 ? "" : "s"} need device, browser, account, result, or screenshot notes.
            </div>
          ) : null}
          {qaReportState ? (
            <div className={qaReportState.includes("copied") || qaReportState.includes("downloaded") ? "success" : "error"} role={qaReportState.includes("copied") || qaReportState.includes("downloaded") ? "status" : "alert"}>
              {qaReportState}
            </div>
          ) : null}
          <div className="launch-qa-groups">
            {qaGroups.map((group) => (
              <section className="launch-qa-group" key={group.group}>
                <div className="section-heading launch-qa-heading">
                  <div>
                    <p className="row-title">{group.label}</p>
                    <p className="row-meta">
                      {group.completed}/{group.total} checked · {group.remaining} remaining
                    </p>
                  </div>
                  <span className={`badge ${group.remaining === 0 ? "success" : "warning"}`}>{group.remaining === 0 ? "done" : "open"}</span>
                </div>
                <div className="list">
                  {group.steps.map((step) => (
                    <LaunchQaStepRow
                      evidence={launchQaEvidence[step.id]}
                      checked={Boolean(launchQaStatus[step.id])}
                      key={step.id}
                      onEvidenceChange={(note) => setLaunchQaEvidenceNote(step.id, note)}
                      onToggle={(checked) => setLaunchQaStep(step.id, checked)}
                      step={step}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </ModuleCard>
    </>
  );
}

function LaunchQaStepRow({
  checked,
  evidence,
  onEvidenceChange,
  onToggle,
  step
}: {
  checked: boolean;
  evidence?: LaunchQaEvidence[string];
  onEvidenceChange: (note: string) => void;
  onToggle: (checked: boolean) => void;
  step: { id: string; label: string; detail: string };
}) {
  const evidenceNote = evidence?.note?.trim();

  return (
    <div className="list-row launch-qa-row">
      <input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} aria-label={`Mark ${step.label} checked`} />
      <div className="row-main">
        <div className="launch-qa-title-line">
          <span className="row-title">{step.label}</span>
          <span className="launch-qa-row-status">
            {checked ? <span className={`badge ${evidenceNote ? "success" : "warning"}`}>{evidenceNote ? "evidenced" : "needs evidence"}</span> : null}
            {evidence?.checkedAt ? <span className="row-meta launch-qa-checked-at">Checked {formatCheckedAt(evidence.checkedAt)}</span> : null}
          </span>
        </div>
        <span className="row-meta">{step.detail}</span>
        <textarea
          className="textarea launch-qa-evidence"
          value={evidence?.note ?? ""}
          onChange={(event) => onEvidenceChange(event.target.value)}
          placeholder="Evidence: device, browser, account, result, screenshot link"
          aria-label={`Evidence for ${step.label}`}
        />
      </div>
    </div>
  );
}

function persistLaunchQaEvidence(evidence: LaunchQaEvidence) {
  if (Object.keys(evidence).length) {
    window.localStorage.setItem(launchQaEvidenceStorageKey, JSON.stringify(evidence));
  } else {
    window.localStorage.removeItem(launchQaEvidenceStorageKey);
  }
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function ReadinessList({ items }: { items: Array<ReadinessItem | LaunchChecklistItem> }) {
  return (
    <div className="list">
      {items.map((item) => (
        <div className="list-row" key={item.id}>
          <div className="row-main">
            <p className="row-title">{item.label}</p>
            <p className="row-meta">{item.detail}</p>
          </div>
          <span className={`badge ${readinessBadgeClass(item.state)}`}>{readinessLabel(item.state)}</span>
        </div>
      ))}
    </div>
  );
}

async function loadServerReadinessItems(): Promise<ReadinessItem[]> {
  try {
    const response = await fetch("/api/readiness/server", { cache: "no-store", headers: await serverReadinessHeaders() });
    if (!response.ok) throw new Error("Readiness request failed.");
    const body = (await response.json()) as { items?: ReadinessItem[] };
    if (!Array.isArray(body.items)) throw new Error("Readiness response was invalid.");
    return body.items;
  } catch {
    return [
      {
        id: "server-readiness",
        label: "Server readiness",
        detail: "Server environment checks could not be loaded.",
        state: "blocked"
      }
    ];
  }
}

async function serverReadinessHeaders() {
  if (!hasSupabaseEnv()) return undefined;
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function collectReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const serviceWorkerSupported = "serviceWorker" in navigator;
  const registration = serviceWorkerSupported ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  const manifest = await loadManifest();
  const offlinePageCached = await isOfflinePageCached();
  const appShellCachedCount = await cachedAppShellAssetCount();
  const offlineQueueSupported = "indexedDB" in window;
  const queuedCaptureCount = await queuedOfflineCaptureCount(offlineQueueSupported);
  const notificationPermission: NotificationPermission | "unsupported" = "Notification" in window ? Notification.permission : "unsupported";

  return {
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    standalone: isStandaloneMode(),
    serviceWorkerSupported,
    serviceWorkerRegistered: Boolean(registration),
    serviceWorkerControlled: Boolean(serviceWorkerSupported && navigator.serviceWorker.controller),
    offlineCacheSupported: "caches" in window,
    offlinePageCached,
    appShellCachedCount,
    appShellExpectedCount: appShellAssets.length,
    offlineQueueSupported,
    queuedCaptureCount,
    notificationsSupported: "Notification" in window,
    pushSupported: "PushManager" in window,
    notificationPermission,
    vapidConfigured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    manifestLoaded: manifest.loaded,
    manifestHasShareTarget: manifest.hasShareTarget,
    manifestShortcutCount: manifest.shortcutCount,
    manifestIconCount: manifest.iconCount,
    manifestHasMaskableIcon: manifest.hasMaskableIcon,
    manifestHasAppId: manifest.hasAppId,
    manifestStartUrlValid: manifest.startUrlValid,
    manifestScopeValid: manifest.scopeValid,
    manifestDisplayStandalone: manifest.displayStandalone,
    downloadsSupported: "Blob" in window && "URL" in window && typeof URL.createObjectURL === "function"
  };
}

async function loadManifest() {
  try {
    const response = await fetch("/manifest.webmanifest", { cache: "no-store" });
    if (!response.ok) throw new Error("Manifest request failed.");
    const manifest = (await response.json()) as {
      id?: unknown;
      start_url?: unknown;
      scope?: unknown;
      display?: unknown;
      share_target?: unknown;
      shortcuts?: unknown[];
      icons?: Array<{ purpose?: string }>;
    };
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    return {
      loaded: true,
      hasShareTarget: Boolean(manifest.share_target),
      shortcutCount: Array.isArray(manifest.shortcuts) ? manifest.shortcuts.length : 0,
      iconCount: icons.length,
      hasMaskableIcon: icons.some((icon) => icon.purpose?.split(/\s+/).includes("maskable")),
      hasAppId: typeof manifest.id === "string" && manifest.id.trim().length > 0,
      startUrlValid: isSameOriginManifestUrl(manifest.start_url),
      scopeValid: isSameOriginManifestUrl(manifest.scope),
      displayStandalone: manifest.display === "standalone"
    };
  } catch {
    return {
      loaded: false,
      hasShareTarget: false,
      shortcutCount: 0,
      iconCount: 0,
      hasMaskableIcon: false,
      hasAppId: false,
      startUrlValid: false,
      scopeValid: false,
      displayStandalone: false
    };
  }
}

function isSameOriginManifestUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function isOfflinePageCached() {
  if (!("caches" in window)) return false;
  return Boolean(await caches.match("/offline.html").catch(() => undefined));
}

async function cachedAppShellAssetCount() {
  if (!("caches" in window)) return null;

  try {
    const matches = await Promise.all(appShellAssets.map((asset) => caches.match(asset)));
    return matches.filter(Boolean).length;
  } catch {
    return null;
  }
}

async function queuedOfflineCaptureCount(offlineQueueSupported: boolean) {
  if (!offlineQueueSupported) return null;

  try {
    return (await readQueuedCaptures()).length;
  } catch {
    return null;
  }
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
