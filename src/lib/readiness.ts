export type ReadinessState = "ready" | "warning" | "blocked" | "checking";

export type ReadinessItem = {
  id: string;
  label: string;
  detail: string;
  state: ReadinessState;
};

export type LaunchChecklistItem = {
  id: string;
  label: string;
  detail: string;
  state: ReadinessState;
};

export type ReadinessSnapshot = {
  online: boolean;
  secureContext: boolean;
  standalone: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerControlled: boolean;
  offlineCacheSupported: boolean;
  offlinePageCached: boolean;
  appShellCachedCount: number | null;
  appShellExpectedCount: number;
  offlineQueueSupported: boolean;
  queuedCaptureCount: number | null;
  notificationsSupported: boolean;
  pushSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  vapidConfigured: boolean;
  manifestLoaded: boolean;
  manifestHasShareTarget: boolean;
  manifestShortcutCount: number;
  manifestIconCount: number;
  manifestHasMaskableIcon: boolean;
  manifestHasAppId: boolean;
  manifestStartUrlValid: boolean;
  manifestScopeValid: boolean;
  manifestDisplayStandalone: boolean;
  downloadsSupported: boolean;
};

export type ServerReadinessSnapshot = {
  supabaseUrlConfigured: boolean;
  supabaseAnonConfigured: boolean;
  supabaseUrlValid: boolean;
  supabaseUrlSecure: boolean;
  supabaseUrlLocal: boolean;
  serviceRoleConfigured: boolean;
  vapidPublicConfigured: boolean;
  vapidPrivateConfigured: boolean;
  vapidSubjectConfigured: boolean;
  vapidSubjectValid: boolean;
  vapidSubjectPlaceholder: boolean;
  cronSecretConfigured: boolean;
  cronSecretWeak: boolean;
  cronSecretPlaceholder: boolean;
};

const minProductionCronSecretLength = 32;

export function buildReadinessItems(snapshot: ReadinessSnapshot): ReadinessItem[] {
  return [
    {
      id: "network",
      label: "Network",
      detail: snapshot.online ? "Online now." : "Offline now. Cached shell should still open.",
      state: snapshot.online ? "ready" : "warning"
    },
    {
      id: "secure-context",
      label: "Secure context",
      detail: snapshot.secureContext ? "HTTPS or localhost secure context is active." : "Use HTTPS outside localhost for service worker, push, install, and share APIs.",
      state: snapshot.secureContext ? "ready" : "blocked"
    },
    {
      id: "install",
      label: "Install mode",
      detail: snapshot.standalone ? "Running as an installed app." : "Open in browser tab.",
      state: snapshot.standalone ? "ready" : "warning"
    },
    {
      id: "service-worker",
      label: "Service worker",
      detail: serviceWorkerDetail(snapshot),
      state: serviceWorkerState(snapshot)
    },
    {
      id: "offline",
      label: "Offline shell",
      detail: snapshot.offlinePageCached ? "Offline fallback is cached." : "Offline fallback is not cached yet.",
      state: snapshot.offlineCacheSupported && snapshot.offlinePageCached ? "ready" : snapshot.offlineCacheSupported ? "warning" : "blocked"
    },
    {
      id: "app-shell-cache",
      label: "App shell assets",
      detail: appShellCacheDetail(snapshot),
      state: appShellCacheState(snapshot)
    },
    {
      id: "offline-queue",
      label: "Offline capture queue",
      detail: offlineQueueDetail(snapshot),
      state: offlineQueueState(snapshot)
    },
    {
      id: "push",
      label: "Push reminders",
      detail: pushDetail(snapshot),
      state: pushState(snapshot)
    },
    {
      id: "manifest",
      label: "Manifest",
      detail: manifestDetail(snapshot),
      state: manifestState(snapshot)
    },
    {
      id: "export",
      label: "Backup download",
      detail: snapshot.downloadsSupported ? "JSON downloads are supported." : "Browser download APIs are unavailable.",
      state: snapshot.downloadsSupported ? "ready" : "blocked"
    }
  ];
}

function manifestDetail(snapshot: ReadinessSnapshot) {
  if (!snapshot.manifestLoaded) return "Manifest could not be loaded.";
  const shareTarget = snapshot.manifestHasShareTarget ? "share target" : "no share target";
  const maskable = snapshot.manifestHasMaskableIcon ? "maskable icon" : "no maskable icon";
  const installMetadata = snapshot.manifestHasAppId && snapshot.manifestStartUrlValid && snapshot.manifestScopeValid && snapshot.manifestDisplayStandalone ? "install metadata" : "incomplete install metadata";
  return `${snapshot.manifestShortcutCount} shortcuts, ${snapshot.manifestIconCount} icons, ${shareTarget}, ${maskable}, ${installMetadata}.`;
}

function manifestState(snapshot: ReadinessSnapshot) {
  if (!snapshot.manifestLoaded) return "blocked";
  return snapshot.manifestHasShareTarget &&
    snapshot.manifestIconCount >= 2 &&
    snapshot.manifestHasMaskableIcon &&
    snapshot.manifestHasAppId &&
    snapshot.manifestStartUrlValid &&
    snapshot.manifestScopeValid &&
    snapshot.manifestDisplayStandalone
    ? "ready"
    : "warning";
}

export function buildServerReadinessItems(snapshot: ServerReadinessSnapshot): ReadinessItem[] {
  return [
    {
      id: "server-supabase",
      label: "Supabase client",
      detail: supabaseServerDetail(snapshot),
      state: supabaseServerState(snapshot)
    },
    {
      id: "server-admin",
      label: "Server admin",
      detail: snapshot.serviceRoleConfigured ? "Service-role key is configured for server jobs." : "Missing SUPABASE_SERVICE_ROLE_KEY.",
      state: snapshot.serviceRoleConfigured ? "ready" : "blocked"
    },
    {
      id: "server-push",
      label: "Push sender",
      detail: pushServerDetail(snapshot),
      state: pushServerState(snapshot)
    },
    {
      id: "server-cron",
      label: "Cron guard",
      detail: cronServerDetail(snapshot),
      state: cronServerState(snapshot)
    }
  ];
}

export function collectServerReadinessSnapshot(env: Record<string, string | undefined>): ServerReadinessSnapshot {
  const supabaseUrl = normalizeEnvValue(env.NEXT_PUBLIC_SUPABASE_URL);
  const parsedSupabaseUrl = parseUrl(supabaseUrl);
  const vapidSubject = normalizeEnvValue(env.VAPID_SUBJECT);
  const cronSecret = normalizeEnvValue(env.CRON_SECRET);

  return {
    supabaseUrlConfigured: Boolean(supabaseUrl),
    supabaseAnonConfigured: Boolean(normalizeEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
    supabaseUrlValid: Boolean(parsedSupabaseUrl),
    supabaseUrlSecure: Boolean(parsedSupabaseUrl && (parsedSupabaseUrl.protocol === "https:" || isLocalHost(parsedSupabaseUrl.hostname))),
    supabaseUrlLocal: Boolean(parsedSupabaseUrl && isLocalHost(parsedSupabaseUrl.hostname)),
    serviceRoleConfigured: Boolean(normalizeEnvValue(env.SUPABASE_SERVICE_ROLE_KEY)),
    vapidPublicConfigured: Boolean(normalizeEnvValue(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)),
    vapidPrivateConfigured: Boolean(normalizeEnvValue(env.VAPID_PRIVATE_KEY)),
    vapidSubjectConfigured: Boolean(vapidSubject),
    vapidSubjectValid: isValidVapidSubject(vapidSubject),
    vapidSubjectPlaceholder: isPlaceholderVapidSubject(vapidSubject),
    cronSecretConfigured: Boolean(cronSecret),
    cronSecretWeak: Boolean(cronSecret && cronSecret.length < minProductionCronSecretLength),
    cronSecretPlaceholder: isPlaceholderSecret(cronSecret)
  };
}

export function summarizeReadiness(items: ReadinessItem[]) {
  return {
    ready: items.filter((item) => item.state === "ready").length,
    warning: items.filter((item) => item.state === "warning").length,
    blocked: items.filter((item) => item.state === "blocked").length,
    total: items.length
  };
}

export function buildLaunchChecklist(items: ReadinessItem[]): LaunchChecklistItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));

  return [
    {
      id: "launch-env",
      label: "Production environment",
      detail: launchDetail([byId.get("server-supabase"), byId.get("server-admin")], "Supabase client and service role are configured."),
      state: combinedState([byId.get("server-supabase"), byId.get("server-admin")])
    },
    {
      id: "launch-push-cron",
      label: "Reminder delivery",
      detail: launchDetail([byId.get("server-push"), byId.get("server-cron")], "Push sender and cron protection are configured."),
      state: combinedState([byId.get("server-push"), byId.get("server-cron")])
    },
    {
      id: "launch-pwa",
      label: "Installable PWA",
      detail: launchDetail(
        [byId.get("secure-context"), byId.get("manifest"), byId.get("service-worker"), byId.get("offline"), byId.get("app-shell-cache"), byId.get("offline-queue")],
        "Secure context, manifest, service worker, offline shell assets, and capture queue are ready."
      ),
      state: combinedState([byId.get("secure-context"), byId.get("manifest"), byId.get("service-worker"), byId.get("offline"), byId.get("app-shell-cache"), byId.get("offline-queue")])
    },
    {
      id: "launch-device-push",
      label: "This-device push",
      detail: byId.get("push")?.detail ?? "Push readiness has not been checked on this device.",
      state: byId.get("push")?.state ?? "checking"
    },
    {
      id: "launch-backup",
      label: "Backup path",
      detail: byId.get("export")?.detail ?? "Backup download support has not been checked.",
      state: byId.get("export")?.state ?? "checking"
    },
    {
      id: "launch-smoke",
      label: "Production smoke pass",
      detail: "Run signup, onboarding, install, push, share target, screenshot upload, search, export/import, and account deletion against the production domain.",
      state: "warning"
    }
  ];
}

function launchDetail(items: Array<ReadinessItem | undefined>, readyDetail: string) {
  const missing = items.filter((item) => !item || item.state !== "ready");
  if (!missing.length) return readyDetail;
  return missing.map((item) => `${item?.label ?? "Missing check"}: ${item?.detail ?? "Not loaded."}`).join(" ");
}

function combinedState(items: Array<ReadinessItem | undefined>): ReadinessState {
  if (items.some((item) => !item || item.state === "blocked")) return "blocked";
  if (items.some((item) => item?.state === "warning" || item?.state === "checking")) return "warning";
  return "ready";
}

export function readinessBadgeClass(state: ReadinessState) {
  if (state === "ready") return "success";
  if (state === "warning") return "warning";
  if (state === "blocked") return "danger";
  return "";
}

export function readinessLabel(state: ReadinessState) {
  if (state === "ready") return "ready";
  if (state === "warning") return "check";
  if (state === "blocked") return "blocked";
  return "checking";
}

function serviceWorkerState(snapshot: ReadinessSnapshot): ReadinessState {
  if (!snapshot.serviceWorkerSupported) return "blocked";
  if (snapshot.serviceWorkerRegistered && snapshot.serviceWorkerControlled) return "ready";
  if (snapshot.serviceWorkerRegistered) return "warning";
  return "blocked";
}

function supabaseServerState(snapshot: ServerReadinessSnapshot): ReadinessState {
  if (!snapshot.supabaseUrlConfigured || !snapshot.supabaseAnonConfigured || !snapshot.supabaseUrlValid || !snapshot.supabaseUrlSecure) return "blocked";
  if (snapshot.supabaseUrlLocal) return "warning";
  return "ready";
}

function supabaseServerDetail(snapshot: ServerReadinessSnapshot) {
  if (!snapshot.supabaseUrlConfigured || !snapshot.supabaseAnonConfigured) return "Missing public Supabase URL or anon key.";
  if (!snapshot.supabaseUrlValid) return "Supabase URL is not a valid URL.";
  if (!snapshot.supabaseUrlSecure) return "Supabase URL must use HTTPS outside local development.";
  if (snapshot.supabaseUrlLocal) return "Local Supabase URL is configured; use the production project URL before launch.";
  return "Public Supabase URL and anon key are configured.";
}

function pushServerState(snapshot: ServerReadinessSnapshot): ReadinessState {
  if (!snapshot.vapidPublicConfigured || !snapshot.vapidPrivateConfigured || !snapshot.vapidSubjectConfigured || !snapshot.vapidSubjectValid) return "blocked";
  if (snapshot.vapidSubjectPlaceholder) return "warning";
  return "ready";
}

function pushServerDetail(snapshot: ServerReadinessSnapshot) {
  if (!snapshot.vapidPublicConfigured || !snapshot.vapidPrivateConfigured || !snapshot.vapidSubjectConfigured) return "Missing one or more VAPID push settings.";
  if (!snapshot.vapidSubjectValid) return "VAPID_SUBJECT must be a mailto: address or HTTPS URL.";
  if (snapshot.vapidSubjectPlaceholder) return "VAPID_SUBJECT still looks like a placeholder contact.";
  return "VAPID public key, private key, and subject are configured.";
}

function cronServerState(snapshot: ServerReadinessSnapshot): ReadinessState {
  if (!snapshot.cronSecretConfigured || snapshot.cronSecretWeak || snapshot.cronSecretPlaceholder) return "blocked";
  return "ready";
}

function cronServerDetail(snapshot: ServerReadinessSnapshot) {
  if (!snapshot.cronSecretConfigured) return "CRON_SECRET is not set; production reminder sends fail closed until it is configured.";
  if (snapshot.cronSecretPlaceholder) return "CRON_SECRET still looks like a placeholder.";
  if (snapshot.cronSecretWeak) return `CRON_SECRET is short; use at least ${minProductionCronSecretLength} random characters before production.`;
  return "Reminder endpoint expects a cron secret.";
}

function normalizeEnvValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function parseUrl(value: string) {
  if (!value) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function isValidVapidSubject(value: string) {
  if (!value) return false;
  if (value.startsWith("mailto:")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.slice("mailto:".length));
  const parsedUrl = parseUrl(value);
  return parsedUrl?.protocol === "https:";
}

function isPlaceholderVapidSubject(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "mailto:you@example.com" || normalized.includes("example.com") || normalized.includes("change-me") || normalized.includes("replace-me");
}

function isPlaceholderSecret(value: string) {
  const normalized = value.toLowerCase();
  return [
    "secret",
    "cron_secret",
    "cron-secret",
    "change-me",
    "changeme",
    "replace-me",
    "password",
    "your-secret",
    "your-cron-secret",
    "replace-with-long-random-secret",
    "replace-with-at-least-32-random-characters"
  ].includes(normalized);
}

function serviceWorkerDetail(snapshot: ReadinessSnapshot) {
  if (!snapshot.serviceWorkerSupported) return "This browser does not support service workers.";
  if (snapshot.serviceWorkerRegistered && snapshot.serviceWorkerControlled) return "Registered and controlling this page.";
  if (snapshot.serviceWorkerRegistered) return "Registered; reload once for full control.";
  return "No registration found.";
}

function offlineQueueState(snapshot: ReadinessSnapshot): ReadinessState {
  if (!snapshot.offlineQueueSupported) return "blocked";
  if (snapshot.queuedCaptureCount === null) return "warning";
  return snapshot.queuedCaptureCount > 0 ? "warning" : "ready";
}

function appShellCacheState(snapshot: ReadinessSnapshot): ReadinessState {
  if (!snapshot.offlineCacheSupported) return "blocked";
  if (snapshot.appShellCachedCount === null) return "warning";
  return snapshot.appShellExpectedCount > 0 && snapshot.appShellCachedCount >= snapshot.appShellExpectedCount ? "ready" : "warning";
}

function appShellCacheDetail(snapshot: ReadinessSnapshot) {
  if (!snapshot.offlineCacheSupported) return "Cache storage is unavailable, so app shell assets cannot be verified.";
  if (snapshot.appShellCachedCount === null) return "App shell cache coverage could not be read.";
  if (snapshot.appShellExpectedCount > 0 && snapshot.appShellCachedCount >= snapshot.appShellExpectedCount) {
    return `${snapshot.appShellCachedCount}/${snapshot.appShellExpectedCount} offline shell assets cached.`;
  }
  return `${snapshot.appShellCachedCount}/${snapshot.appShellExpectedCount} offline shell assets cached; reload once after service worker install.`;
}

function offlineQueueDetail(snapshot: ReadinessSnapshot) {
  if (!snapshot.offlineQueueSupported) return "IndexedDB is unavailable, so offline captures cannot be queued.";
  if (snapshot.queuedCaptureCount === null) return "Queue storage could not be read.";
  if (snapshot.queuedCaptureCount === 0) return "Offline link and note captures can be queued.";
  return `${snapshot.queuedCaptureCount} offline capture${snapshot.queuedCaptureCount === 1 ? "" : "s"} waiting to sync.`;
}

function pushState(snapshot: ReadinessSnapshot): ReadinessState {
  if (!snapshot.notificationsSupported || !snapshot.pushSupported || !snapshot.serviceWorkerSupported || !snapshot.vapidConfigured) return "blocked";
  if (snapshot.notificationPermission === "granted") return "ready";
  if (snapshot.notificationPermission === "denied") return "blocked";
  return "warning";
}

function pushDetail(snapshot: ReadinessSnapshot) {
  if (!snapshot.notificationsSupported) return "Notifications are not supported here.";
  if (!snapshot.pushSupported) return "PushManager is not supported here.";
  if (!snapshot.serviceWorkerSupported) return "Service worker support is required.";
  if (!snapshot.vapidConfigured) return "Missing VAPID public key.";
  if (snapshot.notificationPermission === "granted") return "Notification permission is granted.";
  if (snapshot.notificationPermission === "denied") return "Notification permission is blocked.";
  return "Permission has not been granted on this device.";
}
