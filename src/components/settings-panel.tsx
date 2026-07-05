"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bell, BookmarkPlus, Copy, Download, EyeOff, Loader2, Send, ShieldAlert, Trash2, Upload } from "lucide-react";
import { DeviceReadinessPanel } from "@/components/device-readiness";
import { ModuleCard } from "@/components/module-card";
import { OfflineQueuePanel } from "@/components/offline-queue-panel";
import { PwaInstallPanel } from "@/components/pwa-install-panel";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CheckItem } from "@/components/ui/check-item";
import { Field, Input, Label, Select } from "@/components/ui/form";
import { getSupabase } from "@/lib/supabase";
import { showLocalTestNotification, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { buildCsvExportFiles, buildFullExportPayload, downloadCsvZip, downloadJson, loadFullExportAttachmentFiles, loadFullExportData } from "@/lib/export";
import { backupImportCountsForUser, importBackupData, parseBackupPayload, type BackupImportPlan } from "@/lib/backup-import";
import { loadBackupHealth, saveBackupHealth, summarizeBackupHealth, type BackupHealthRecord } from "@/lib/backup-health";
import { buildCaptureBookmarklet } from "@/lib/bookmarklet";
import { clearOrbitPersonalBrowserState } from "@/lib/client-storage";
import { dashboardWidgetDefinitions, normalizeDashboardWidgets, toggleDashboardWidget } from "@/lib/dashboard-widgets";
import { privacyShieldRequestEvent, readPrivacyShieldAutoLock, savePrivacyShieldAutoLock } from "@/lib/privacy-shield";
import type { DashboardWidgetId, WeightUnit } from "@/lib/types";

type BrowserNotificationPermission = NotificationPermission | "unsupported" | "checking";
type NoticeTone = "neutral" | "success" | "warning" | "danger";

const NOTICE_TONES: Record<NoticeTone, string> = {
  neutral: "border-hairline bg-surface-inset text-ink-muted",
  success: "border-hairline bg-emerald-1 text-emerald-5",
  warning: "border-hairline bg-heather-1 text-heather-5",
  danger: "border-hairline bg-surface text-urgent"
};

function Notice({ tone = "neutral", role, children }: { tone?: string; role?: "status" | "alert"; children: ReactNode }) {
  const toneClass = NOTICE_TONES[(tone as NoticeTone)] ?? NOTICE_TONES.neutral;
  return (
    <div className={`flex items-start gap-2 rounded-tile border px-3 py-2 text-[13px] ${toneClass}`} role={role}>
      {children}
    </div>
  );
}

export function SettingsPanel({ userId, userEmail }: { userId: string; userEmail: string | undefined }) {
  const [pushState, setPushState] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<BrowserNotificationPermission>("checking");
  const [busy, setBusy] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [disablingPush, setDisablingPush] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [exportState, setExportState] = useState<string | null>(null);
  const [backupHealth, setBackupHealth] = useState<BackupHealthRecord | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPlan, setImportPlan] = useState<BackupImportPlan | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importState, setImportState] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const importCounts = importPlan ? backupImportCountsForUser(importPlan, userId) : null;
  const notificationFeedback = notificationPermissionFeedback(notificationPermission);
  const notificationPermissionBlocksPush = notificationPermission === "denied" || notificationPermission === "unsupported";
  const backupHealthSummary = summarizeBackupHealth(backupHealth);

  useEffect(() => {
    const refreshNotificationPermission = () => setNotificationPermission(readNotificationPermission());

    refreshNotificationPermission();
    window.addEventListener("focus", refreshNotificationPermission);
    document.addEventListener("visibilitychange", refreshNotificationPermission);

    return () => {
      window.removeEventListener("focus", refreshNotificationPermission);
      document.removeEventListener("visibilitychange", refreshNotificationPermission);
    };
  }, []);

  useEffect(() => {
    setBackupHealth(loadBackupHealth(userId));
  }, [userId]);

  async function enablePush() {
    setBusy(true);
    setPushState(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
      const subscription = await subscribeToPush(publicKey);
      const json = subscription.toJSON();
      const keys = json.keys;
      if (!json.endpoint || !keys?.p256dh || !keys.auth) {
        throw new Error("Push subscription did not include required keys.");
      }

      await getSupabase().from("push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: json.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: navigator.userAgent
        },
        { onConflict: "user_id,endpoint" }
      );
      setPushState("Push notifications are enabled on this device.");
    } catch (error) {
      setPushState(error instanceof Error ? error.message : "Push setup failed.");
    } finally {
      setNotificationPermission(readNotificationPermission());
      setBusy(false);
    }
  }

  async function sendTestNotification() {
    setTestingNotification(true);
    setPushState(null);
    try {
      await showLocalTestNotification();
      setPushState("Test notification sent on this device.");
    } catch (error) {
      setPushState(error instanceof Error ? error.message : "Test notification failed.");
    } finally {
      setNotificationPermission(readNotificationPermission());
      setTestingNotification(false);
    }
  }

  async function disablePush() {
    setDisablingPush(true);
    setPushState(null);
    try {
      const result = await unsubscribeFromPush(getSupabase());
      if (!result.browserSubscriptionFound) {
        setPushState("No push subscription is active on this browser.");
      } else if (result.browserUnsubscribed && result.serverSubscriptionRemoved) {
        setPushState("Push notifications are disabled on this device.");
      } else if (result.browserUnsubscribed) {
        setPushState("Push is disabled in this browser. Server cleanup will finish after the next reminder send.");
      } else if (result.serverSubscriptionRemoved) {
        setPushState("Push subscription was removed from Orbit for this device.");
      } else {
        setPushState("Push subscription could not be disabled.");
      }
    } catch (error) {
      setPushState(error instanceof Error ? error.message : "Push subscription could not be disabled.");
    } finally {
      setNotificationPermission(readNotificationPermission());
      setDisablingPush(false);
    }
  }

  async function exportData() {
    setExporting(true);
    setExportState(null);
    try {
      const fullData = await loadFullExportData(userId);
      const attachmentFiles = await loadFullExportAttachmentFiles(userId, fullData.attachments);
      const payload = buildFullExportPayload(userId, fullData, new Date().toISOString(), attachmentFiles);
      const recordCount = Object.values(payload.summary).reduce((total, count) => total + count, 0);
      const healthRecord = {
        userId,
        exportedAt: payload.exportedAt,
        recordCount,
        attachmentFileCount: attachmentFiles.length
      };
      downloadJson(`orbit-export-${new Date().toISOString().slice(0, 10)}.json`, payload);
      saveBackupHealth(healthRecord);
      setBackupHealth(healthRecord);
      setExportState(`Exported ${recordCount} database records and ${attachmentFiles.length} attachment files.`);
    } catch (error) {
      setExportState(error instanceof Error ? error.message : "Data export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function exportCsvData() {
    setCsvExporting(true);
    setExportState(null);
    try {
      const fullData = await loadFullExportData(userId);
      const files = buildCsvExportFiles(fullData);
      const rowCount = files.reduce((total, file) => total + file.rowCount, 0);
      downloadCsvZip(`orbit-csv-${new Date().toISOString().slice(0, 10)}.zip`, files);
      setExportState(`Exported ${rowCount} rows across ${files.length} CSV files.`);
    } catch (error) {
      setExportState(error instanceof Error ? error.message : "CSV export failed.");
    } finally {
      setCsvExporting(false);
    }
  }

  async function loadImportFile(file: File | undefined) {
    setImportPlan(null);
    setImportFileName(file?.name ?? null);
    setImportState(null);
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const plan = parseBackupPayload(payload);
      const counts = backupImportCountsForUser(plan, userId);
      setImportPlan(plan);
      setImportState(`Ready to import ${counts.importableTotal} records. ${counts.skippedTotal} records will be skipped.`);
    } catch (error) {
      setImportState(error instanceof Error ? error.message : "Could not read backup file.");
    }
  }

  async function importData() {
    if (!importPlan) return;
    setImporting(true);
    setImportState(null);

    try {
      const result = await importBackupData(userId, importPlan);
      const invalidReferenceCopy = result.skippedInvalidReferences ? `, and skipped ${result.skippedInvalidReferences} rows with missing parent records` : "";
      setImportState(
        `Imported ${result.totalImported} records. Reused ${result.reusedTags} existing tags, skipped ${result.skipped.push_subscriptions} push subscriptions, skipped ${result.skippedAttachmentMetadata} attachment metadata records${invalidReferenceCopy}.`
      );
    } catch (error) {
      setImportState(error instanceof Error ? error.message : "Data import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setDeleteError(null);
    const supabase = getSupabase();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setDeleteError("You need to sign in again before deleting the account.");
      setBusy(false);
      return;
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setDeleteError(body?.error ?? "Account deletion failed.");
      setBusy(false);
      return;
    }

    await unsubscribeFromPush(supabase).catch(() => null);
    await supabase.auth.signOut();
    await clearOrbitPersonalBrowserState();
    window.location.assign("/sign-in");
  }

  return (
    <div className="flex flex-col gap-4">
      <ProfilePreferences userId={userId} userEmail={userEmail} />
      <ModuleCard title="Account" kicker={userEmail ?? "Signed in"}>
        <div className="flex flex-col gap-3">
          <Notice tone={backupHealthSummary.tone as NoticeTone}>
            <Download size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">{backupHealthSummary.title}</strong>
              <br />
              {backupHealthSummary.detail}
            </span>
          </Notice>
          <SettingRow title="Export full backup" detail="Downloads every owner-scoped database row as JSON, with private attachment files embedded for portable restore.">
            <Button variant="secondary" size="sm" type="button" disabled={exporting} onClick={exportData}>
              {exporting ? <Loader2 size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {exporting ? "Preparing" : "Export"}
            </Button>
          </SettingRow>
          <SettingRow title="Export CSV bundle" detail="Downloads spreadsheet-friendly CSV files for each Orbit table. Attachments stay as metadata rows.">
            <Button variant="secondary" size="sm" type="button" disabled={csvExporting} onClick={exportCsvData}>
              {csvExporting ? <Loader2 size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {csvExporting ? "Preparing" : "CSV"}
            </Button>
          </SettingRow>
          {exportState ? <Notice tone={exportState.startsWith("Exported") ? "success" : "danger"} role={exportState.startsWith("Exported") ? "status" : "alert"}>{exportState}</Notice> : null}
          <SettingRow title="Import backup" detail="Merges an Orbit full export into this account. Existing rows are updated by ID; nothing is deleted.">
            <label
              htmlFor="backup-import-file"
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-pill border border-hairline bg-surface px-3 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-inset"
            >
              <Upload size={14} aria-hidden="true" />
              Choose file
            </label>
            <input id="backup-import-file" className="sr-only" type="file" accept="application/json,.json" onChange={(event) => void loadImportFile(event.target.files?.[0])} />
          </SettingRow>
          {importPlan ? (
            <Notice>
              {importFileName ? `${importFileName} · ` : ""}
              {importCounts?.importableTotal ?? importPlan.importableTotal} importable records from {importPlan.exportedAt ? new Date(importPlan.exportedAt).toLocaleString() : "an unknown export date"}. Push subscriptions are skipped; attachment metadata from another account is skipped unless the backup includes embedded files.
            </Notice>
          ) : null}
          {importState ? (
            <Notice tone={importState.startsWith("Imported") || importState.startsWith("Ready") ? "success" : "danger"} role={importState.startsWith("Imported") || importState.startsWith("Ready") ? "status" : "alert"}>
              {importState}
            </Notice>
          ) : null}
          <Button variant="secondary" type="button" disabled={!importPlan || importing} onClick={importData} className="self-start">
            {importing ? <Loader2 size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
            {importing ? "Importing" : "Import backup"}
          </Button>
          <div className="mt-1 rounded-tile border border-hairline bg-surface-inset p-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-urgent">
              <Trash2 size={15} aria-hidden="true" />
              Delete account
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">Type DELETE to remove personal records and the auth user.</p>
            <div className="mt-2 flex flex-col gap-2">
              <Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} placeholder="DELETE" aria-label="Delete confirmation" />
              {deleteError ? <div className="text-[13px] font-semibold text-urgent" role="alert">{deleteError}</div> : null}
              <Button variant="danger" type="button" disabled={deleteConfirm !== "DELETE" || busy} onClick={deleteAccount} className="self-start">
                {busy ? <Loader2 size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                Delete account
              </Button>
            </div>
          </div>
        </div>
      </ModuleCard>

      <PwaInstallPanel />
      <OfflineQueuePanel userId={userId} />
      <BrowserCapturePanel />
      <LocalPrivacyPanel />
      <ModuleCard title="Notifications" kicker="Web Push reminders are device-specific.">
        <div className="flex flex-col gap-3">
          <Notice tone={notificationFeedback.tone}>
            <ShieldAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{notificationFeedback.message}</span>
          </Notice>
          <Button variant="primary" type="button" disabled={busy || notificationPermissionBlocksPush} onClick={enablePush} className="self-start">
            {busy ? <Loader2 size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
            Enable push on this device
          </Button>
          <Button variant="secondary" type="button" disabled={testingNotification || notificationPermissionBlocksPush} onClick={sendTestNotification} className="self-start">
            {testingNotification ? <Loader2 size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            Send test notification
          </Button>
          <Button variant="secondary" type="button" disabled={disablingPush} onClick={disablePush} className="self-start">
            {disablingPush ? <Loader2 size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
            Disable push on this device
          </Button>
          {pushState ? <Notice tone={pushStateIsSuccess(pushState) ? "success" : "danger"} role={pushStateIsSuccess(pushState) ? "status" : "alert"}>{pushState}</Notice> : null}
        </div>
      </ModuleCard>
      <DeviceReadinessPanel />
    </div>
  );
}

function SettingRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-tile border border-hairline bg-surface p-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[12.5px] text-ink-muted">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function readNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function pushStateIsSuccess(value: string) {
  return value.includes("enabled") || value.includes("sent") || value.includes("disabled") || value.startsWith("No push") || value.includes("removed from Orbit");
}

function notificationPermissionFeedback(permission: BrowserNotificationPermission): { message: string; tone: "danger" | "success" | "warning" } {
  if (permission === "checking") {
    return { message: "Checking notification permission for this browser.", tone: "warning" };
  }
  if (permission === "unsupported") {
    return { message: "This browser cannot show service-worker notifications.", tone: "danger" };
  }
  if (permission === "granted") {
    return { message: "Notifications are allowed on this device.", tone: "success" };
  }
  if (permission === "denied") {
    return { message: "Notifications are blocked for this site. Re-enable them in browser site settings, then refresh Orbit.", tone: "danger" };
  }

  return { message: "Notifications are not enabled yet. Orbit will ask when you enable push on this device.", tone: "warning" };
}

function BrowserCapturePanel() {
  const [bookmarklet, setBookmarklet] = useState("");
  const [copyState, setCopyState] = useState<string | null>(null);

  useEffect(() => {
    setBookmarklet(buildCaptureBookmarklet(window.location.origin));
  }, []);

  async function copyBookmarklet() {
    if (!bookmarklet || !navigator.clipboard) {
      setCopyState("Copy is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopyState("Bookmarklet copied.");
      window.setTimeout(() => setCopyState(null), 1400);
    } catch {
      setCopyState("Copy failed.");
    }
  }

  return (
    <ModuleCard title="Browser capture" kicker="Desktop bookmarklet">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {bookmarklet ? (
            <ButtonLink variant="primary" href={bookmarklet}>
              <BookmarkPlus size={16} aria-hidden="true" />
              Save to Orbit
            </ButtonLink>
          ) : (
            <Button variant="primary" type="button" disabled>
              <BookmarkPlus size={16} aria-hidden="true" />
              Save to Orbit
            </Button>
          )}
          <Button variant="secondary" type="button" onClick={copyBookmarklet} disabled={!bookmarklet}>
            <Copy size={16} aria-hidden="true" />
            Copy
          </Button>
        </div>
        <Notice>Drag the Save to Orbit button to your bookmarks bar, or copy the shortcut.</Notice>
        {copyState ? <Notice tone={copyState.includes("copied") ? "success" : "danger"} role={copyState.includes("copied") ? "status" : "alert"}>{copyState}</Notice> : null}
      </div>
    </ModuleCard>
  );
}

function LocalPrivacyPanel() {
  const [autoLockOnHidden, setAutoLockOnHidden] = useState(false);

  useEffect(() => {
    setAutoLockOnHidden(readPrivacyShieldAutoLock());
  }, []);

  function onAutoLockChange(enabled: boolean) {
    savePrivacyShieldAutoLock(enabled);
    setAutoLockOnHidden(enabled);
  }

  function hideAppNow() {
    window.dispatchEvent(new Event(privacyShieldRequestEvent));
  }

  return (
    <ModuleCard title="Local privacy" kicker="This browser only">
      <div className="flex flex-col gap-3">
        <SettingRow title="Privacy shield" detail="Cover the open app without signing out.">
          <Button variant="secondary" size="sm" type="button" onClick={hideAppNow}>
            <EyeOff size={16} aria-hidden="true" />
            Hide now
          </Button>
        </SettingRow>
        <CheckItem
          checked={autoLockOnHidden}
          onChange={onAutoLockChange}
          label={
            <span className="block">
              <span className="block font-semibold text-ink">Shield when app is hidden</span>
              <span className="block text-[12px] text-ink-muted">When Orbit returns from the background, personal content stays covered until you reveal it.</span>
            </span>
          }
        />
      </div>
    </ModuleCard>
  );
}

function ProfilePreferences({ userId, userEmail }: { userId: string; userEmail: string | undefined }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [dailyCalorieTarget, setDailyCalorieTarget] = useState("");
  const [dailyProteinTarget, setDailyProteinTarget] = useState("");
  const [dailyCarbsTarget, setDailyCarbsTarget] = useState("");
  const [dailyFatTarget, setDailyFatTarget] = useState("");
  const [weeklyWorkoutTarget, setWeeklyWorkoutTarget] = useState("150");
  const [dashboardModules, setDashboardModules] = useState<DashboardWidgetId[]>(normalizeDashboardWidgets(null));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      const fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { data, error: profileError } = await getSupabase().from("profiles").select("*").eq("id", userId).maybeSingle();

      if (cancelled) return;
      if (profileError) {
        setError(profileError.message);
      }

      setDisplayName(data?.display_name ?? userEmail?.split("@")[0] ?? "");
      setTimezone(data?.timezone ?? fallbackTimezone);
      setWeightUnit(data?.weight_unit ?? "kg");
      setDailyCalorieTarget(data?.daily_calorie_target === null || data?.daily_calorie_target === undefined ? "" : String(data.daily_calorie_target));
      setDailyProteinTarget(data?.daily_protein_target === null || data?.daily_protein_target === undefined ? "" : String(data.daily_protein_target));
      setDailyCarbsTarget(data?.daily_carbs_target === null || data?.daily_carbs_target === undefined ? "" : String(data.daily_carbs_target));
      setDailyFatTarget(data?.daily_fat_target === null || data?.daily_fat_target === undefined ? "" : String(data.daily_fat_target));
      setWeeklyWorkoutTarget(String(data?.weekly_workout_minutes_target ?? 150));
      setDashboardModules(normalizeDashboardWidgets(data?.dashboard_modules));
      setLoading(false);
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userEmail, userId]);

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    setError(null);

    const calorieTarget = dailyCalorieTarget.trim() ? Number(dailyCalorieTarget) : null;
    const proteinTarget = dailyProteinTarget.trim() ? Number(dailyProteinTarget) : null;
    const carbsTarget = dailyCarbsTarget.trim() ? Number(dailyCarbsTarget) : null;
    const fatTarget = dailyFatTarget.trim() ? Number(dailyFatTarget) : null;
    const workoutTarget = weeklyWorkoutTarget.trim() ? Number(weeklyWorkoutTarget) : 0;
    const { error: saveError } = await getSupabase().from("profiles").upsert(
      {
        id: userId,
        display_name: displayName.trim() || null,
        timezone: timezone.trim() || "UTC",
        weight_unit: weightUnit,
        daily_calorie_target: calorieTarget,
        daily_protein_target: proteinTarget,
        daily_carbs_target: carbsTarget,
        daily_fat_target: fatTarget,
        weekly_workout_minutes_target: workoutTarget,
        dashboard_modules: dashboardModules
      },
      { onConflict: "id" }
    );

    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage("Preferences saved.");
    }
    setSaving(false);
  }

  function onToggleDashboardModule(id: DashboardWidgetId) {
    setDashboardModules((current) => toggleDashboardWidget(current, id));
  }

  return (
    <ModuleCard title="Preferences" kicker={loading ? "Loading profile..." : "Used by health logs and daily targets."}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Display name" htmlFor="profile-display-name">
            <Input id="profile-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" disabled={loading} />
          </Field>
          <Field label="Timezone" htmlFor="profile-timezone">
            <Input id="profile-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Riyadh" disabled={loading} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight unit" htmlFor="profile-weight-unit">
            <Select id="profile-weight-unit" value={weightUnit} onChange={(event) => setWeightUnit(event.target.value as WeightUnit)} disabled={loading}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </Select>
          </Field>
          <Field label="Daily calorie target" htmlFor="profile-calorie-target">
            <Input id="profile-calorie-target" type="number" inputMode="numeric" min="0" max="20000" value={dailyCalorieTarget} onChange={(event) => setDailyCalorieTarget(event.target.value)} placeholder="Optional" disabled={loading} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily protein target" htmlFor="profile-protein-target">
            <Input id="profile-protein-target" type="number" inputMode="numeric" min="0" max="1000" value={dailyProteinTarget} onChange={(event) => setDailyProteinTarget(event.target.value)} placeholder="Optional" disabled={loading} />
          </Field>
          <Field label="Daily carbs target" htmlFor="profile-carbs-target">
            <Input id="profile-carbs-target" type="number" inputMode="numeric" min="0" max="2000" value={dailyCarbsTarget} onChange={(event) => setDailyCarbsTarget(event.target.value)} placeholder="Optional" disabled={loading} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily fat target" htmlFor="profile-fat-target">
            <Input id="profile-fat-target" type="number" inputMode="numeric" min="0" max="1000" value={dailyFatTarget} onChange={(event) => setDailyFatTarget(event.target.value)} placeholder="Optional" disabled={loading} />
          </Field>
          <Field label="Weekly workout minutes target" htmlFor="profile-workout-target">
            <Input id="profile-workout-target" type="number" inputMode="numeric" min="0" max="10080" value={weeklyWorkoutTarget} onChange={(event) => setWeeklyWorkoutTarget(event.target.value)} disabled={loading} />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Dashboard modules</Label>
          <div className="flex flex-col gap-2">
            {dashboardWidgetDefinitions.map((definition) => {
              const checked = dashboardModules.includes(definition.id);
              return (
                <CheckItem
                  key={definition.id}
                  checked={checked}
                  disabled={loading || (checked && dashboardModules.length === 1)}
                  onChange={() => onToggleDashboardModule(definition.id)}
                  label={
                    <span className="block">
                      <span className="block font-semibold text-ink">{definition.label}</span>
                      <span className="block text-[12px] text-ink-muted">{definition.detail}</span>
                    </span>
                  }
                />
              );
            })}
          </div>
          <p className="text-[12px] text-ink-muted">At least one module stays enabled so Today never becomes empty.</p>
        </div>
        {error ? <div className="text-[13px] font-semibold text-urgent" role="alert">{error}</div> : null}
        {message ? (
          <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-4" role="status">
            <Badge tone="success">Saved</Badge>
            {message}
          </div>
        ) : null}
        <Button variant="primary" type="button" disabled={loading || saving} onClick={saveProfile} className="self-start">
          {saving ? <Loader2 size={16} aria-hidden="true" /> : null}
          Save preferences
        </Button>
      </div>
    </ModuleCard>
  );
}
