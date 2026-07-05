import { describe, expect, it } from "vitest";
import {
  buildLaunchChecklist,
  buildReadinessItems,
  buildServerReadinessItems,
  collectServerReadinessSnapshot,
  readinessBadgeClass,
  readinessLabel,
  summarizeReadiness,
  type ReadinessSnapshot
} from "@/lib/readiness";

const readySnapshot: ReadinessSnapshot = {
  online: true,
  secureContext: true,
  standalone: true,
  serviceWorkerSupported: true,
  serviceWorkerRegistered: true,
  serviceWorkerControlled: true,
  offlineCacheSupported: true,
  offlinePageCached: true,
  appShellCachedCount: 6,
  appShellExpectedCount: 6,
  offlineQueueSupported: true,
  queuedCaptureCount: 0,
  notificationsSupported: true,
  pushSupported: true,
  notificationPermission: "granted",
  vapidConfigured: true,
  manifestLoaded: true,
  manifestHasShareTarget: true,
  manifestShortcutCount: 5,
  manifestIconCount: 3,
  manifestHasMaskableIcon: true,
  manifestHasAppId: true,
  manifestStartUrlValid: true,
  manifestScopeValid: true,
  manifestDisplayStandalone: true,
  downloadsSupported: true
};

const readyServerEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-token-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-public-key-value",
  VAPID_PRIVATE_KEY: "vapid-private-key-value",
  VAPID_SUBJECT: "mailto:ops@orbit.app",
  CRON_SECRET: "orbit-cron-secret-for-production-launch"
};

describe("device readiness", () => {
  it("summarizes a fully ready device", () => {
    const items = buildReadinessItems(readySnapshot);

    expect(summarizeReadiness(items)).toEqual({
      ready: 10,
      warning: 0,
      blocked: 0,
      total: 10
    });
    expect(items.find((item) => item.id === "secure-context")).toMatchObject({
      state: "ready",
      detail: "HTTPS or localhost secure context is active."
    });
    expect(items.find((item) => item.id === "manifest")).toMatchObject({
      state: "ready",
      detail: "5 shortcuts, 3 icons, share target, maskable icon, install metadata."
    });
    expect(items.find((item) => item.id === "offline-queue")).toMatchObject({
      state: "ready",
      detail: "Offline link and note captures can be queued."
    });
    expect(items.find((item) => item.id === "app-shell-cache")).toMatchObject({
      state: "ready",
      detail: "6/6 offline shell assets cached."
    });
  });

  it("blocks PWA readiness on insecure production-like contexts", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      secureContext: false
    });
    const checklist = buildLaunchChecklist(items);

    expect(items.find((item) => item.id === "secure-context")).toMatchObject({
      state: "blocked",
      detail: "Use HTTPS outside localhost for service worker, push, install, and share APIs."
    });
    expect(checklist.find((item) => item.id === "launch-pwa")).toMatchObject({
      state: "blocked",
      detail: expect.stringContaining("Use HTTPS outside localhost")
    });
  });

  it("marks common browser gaps as warnings or blocked states", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      standalone: false,
      serviceWorkerControlled: false,
      offlinePageCached: false,
      appShellCachedCount: 3,
      queuedCaptureCount: 2,
      notificationPermission: "default",
      manifestHasShareTarget: false,
      manifestIconCount: 1,
      manifestHasMaskableIcon: false
    });

    expect(items.find((item) => item.id === "install")?.state).toBe("warning");
    expect(items.find((item) => item.id === "service-worker")?.state).toBe("warning");
    expect(items.find((item) => item.id === "offline")?.state).toBe("warning");
    expect(items.find((item) => item.id === "app-shell-cache")).toMatchObject({
      state: "warning",
      detail: "3/6 offline shell assets cached; reload once after service worker install."
    });
    expect(items.find((item) => item.id === "offline-queue")).toMatchObject({
      state: "warning",
      detail: "2 offline captures waiting to sync."
    });
    expect(items.find((item) => item.id === "push")?.state).toBe("warning");
    expect(items.find((item) => item.id === "manifest")?.state).toBe("warning");
  });

  it("warns when manifest install metadata is incomplete", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      manifestHasAppId: false,
      manifestStartUrlValid: false,
      manifestScopeValid: false,
      manifestDisplayStandalone: false
    });

    expect(items.find((item) => item.id === "manifest")).toMatchObject({
      state: "warning",
      detail: "5 shortcuts, 3 icons, share target, maskable icon, incomplete install metadata."
    });
  });

  it("labels unsupported push and service worker as blocked", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      serviceWorkerSupported: false,
      serviceWorkerRegistered: false,
      serviceWorkerControlled: false,
      notificationsSupported: false,
      pushSupported: false,
      offlineQueueSupported: false,
      queuedCaptureCount: null,
      notificationPermission: "unsupported",
      vapidConfigured: false
    });

    expect(items.find((item) => item.id === "service-worker")?.state).toBe("blocked");
    expect(items.find((item) => item.id === "offline-queue")?.state).toBe("blocked");
    expect(items.find((item) => item.id === "push")?.state).toBe("blocked");
  });

  it("blocks push readiness when notification permission is denied", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      notificationPermission: "denied"
    });
    const checklist = buildLaunchChecklist(items);

    expect(items.find((item) => item.id === "push")).toMatchObject({
      state: "blocked",
      detail: "Notification permission is blocked."
    });
    expect(checklist.find((item) => item.id === "launch-device-push")).toMatchObject({
      state: "blocked",
      detail: "Notification permission is blocked."
    });
  });

  it("warns when offline queue storage cannot be read", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      queuedCaptureCount: null
    });

    expect(items.find((item) => item.id === "offline-queue")).toMatchObject({
      state: "warning",
      detail: "Queue storage could not be read."
    });
  });

  it("warns when app shell asset cache coverage cannot be read", () => {
    const items = buildReadinessItems({
      ...readySnapshot,
      appShellCachedCount: null
    });

    expect(items.find((item) => item.id === "app-shell-cache")).toMatchObject({
      state: "warning",
      detail: "App shell cache coverage could not be read."
    });
  });

  it("maps states to compact badge vocabulary", () => {
    expect(readinessBadgeClass("ready")).toBe("success");
    expect(readinessBadgeClass("warning")).toBe("warning");
    expect(readinessBadgeClass("blocked")).toBe("danger");
    expect(readinessLabel("checking")).toBe("checking");
  });

  it("builds server readiness without exposing secret values", () => {
    const snapshot = collectServerReadinessSnapshot(readyServerEnv);
    const items = buildServerReadinessItems(snapshot);
    const serializedItems = JSON.stringify(items);

    expect(summarizeReadiness(items)).toEqual({ ready: 4, warning: 0, blocked: 0, total: 4 });
    expect(serializedItems).not.toContain("project-ref.supabase.co");
    expect(serializedItems).not.toContain("anon-token-value");
    expect(serializedItems).not.toContain("service-role-secret-value");
    expect(serializedItems).not.toContain("vapid-public-key-value");
    expect(serializedItems).not.toContain("vapid-private-key-value");
    expect(serializedItems).not.toContain("mailto:ops@orbit.app");
    expect(serializedItems).not.toContain("orbit-cron-secret-for-production-launch");
  });

  it("turns device and server readiness into a launch checklist", () => {
    const items = [
      ...buildReadinessItems(readySnapshot),
      ...buildServerReadinessItems(collectServerReadinessSnapshot(readyServerEnv))
    ];

    const checklist = buildLaunchChecklist(items);

    expect(checklist.find((item) => item.id === "launch-env")).toMatchObject({ state: "ready" });
    expect(checklist.find((item) => item.id === "launch-push-cron")).toMatchObject({ state: "ready" });
    expect(checklist.find((item) => item.id === "launch-pwa")).toMatchObject({ state: "ready" });
    expect(checklist.find((item) => item.id === "launch-smoke")).toMatchObject({ state: "warning" });
  });

  it("shows blocked launch items when required server checks are missing", () => {
    const checklist = buildLaunchChecklist([...buildReadinessItems(readySnapshot), ...buildServerReadinessItems(collectServerReadinessSnapshot({}))]);

    expect(checklist.find((item) => item.id === "launch-env")).toMatchObject({
      state: "blocked",
      detail: expect.stringContaining("Missing public Supabase URL or anon key.")
    });
    expect(checklist.find((item) => item.id === "launch-push-cron")?.state).toBe("blocked");
  });

  it("warns when server configuration still points at local development", () => {
    const items = buildServerReadinessItems(
      collectServerReadinessSnapshot({
        ...readyServerEnv,
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321"
      })
    );
    const checklist = buildLaunchChecklist(items);

    expect(items.find((item) => item.id === "server-supabase")).toMatchObject({
      state: "warning",
      detail: "Local Supabase URL is configured; use the production project URL before launch."
    });
    expect(checklist.find((item) => item.id === "launch-env")).toMatchObject({
      state: "warning",
      detail: expect.stringContaining("Local Supabase URL is configured")
    });
  });

  it("blocks invalid or insecure Supabase URLs", () => {
    expect(
      buildServerReadinessItems(
        collectServerReadinessSnapshot({
          ...readyServerEnv,
          NEXT_PUBLIC_SUPABASE_URL: "not a url"
        })
      ).find((item) => item.id === "server-supabase")
    ).toMatchObject({
      state: "blocked",
      detail: "Supabase URL is not a valid URL."
    });

    expect(
      buildServerReadinessItems(
        collectServerReadinessSnapshot({
          ...readyServerEnv,
          NEXT_PUBLIC_SUPABASE_URL: "http://project-ref.supabase.co"
        })
      ).find((item) => item.id === "server-supabase")
    ).toMatchObject({
      state: "blocked",
      detail: "Supabase URL must use HTTPS outside local development."
    });
  });

  it("blocks invalid VAPID subject configuration", () => {
    const items = buildServerReadinessItems(
      collectServerReadinessSnapshot({
        ...readyServerEnv,
        VAPID_SUBJECT: "support@example"
      })
    );

    expect(items.find((item) => item.id === "server-push")).toMatchObject({
      state: "blocked",
      detail: "VAPID_SUBJECT must be a mailto: address or HTTPS URL."
    });
  });

  it("warns when production secrets still look temporary", () => {
    const items = buildServerReadinessItems(
      collectServerReadinessSnapshot({
        ...readyServerEnv,
        VAPID_SUBJECT: "mailto:you@example.com",
        CRON_SECRET: "secret"
      })
    );

    expect(items.find((item) => item.id === "server-push")).toMatchObject({
      state: "warning",
      detail: "VAPID_SUBJECT still looks like a placeholder contact."
    });
    expect(items.find((item) => item.id === "server-cron")).toMatchObject({
      state: "blocked",
      detail: "CRON_SECRET still looks like a placeholder."
    });
  });

  it("blocks the example cron placeholder even though it is long", () => {
    const items = buildServerReadinessItems(
      collectServerReadinessSnapshot({
        ...readyServerEnv,
        CRON_SECRET: "replace-with-at-least-32-random-characters"
      })
    );

    expect(items.find((item) => item.id === "server-cron")).toMatchObject({
      state: "blocked",
      detail: "CRON_SECRET still looks like a placeholder."
    });
  });

  it("blocks launch readiness when the cron secret is too short for production", () => {
    const items = buildServerReadinessItems(
      collectServerReadinessSnapshot({
        ...readyServerEnv,
        CRON_SECRET: "short-randomish-secret"
      })
    );

    expect(items.find((item) => item.id === "server-cron")).toMatchObject({
      state: "blocked",
      detail: "CRON_SECRET is short; use at least 32 random characters before production."
    });
  });

  it("rolls pending offline captures into PWA launch readiness", () => {
    const checklist = buildLaunchChecklist(buildReadinessItems({ ...readySnapshot, queuedCaptureCount: 1 }));

    expect(checklist.find((item) => item.id === "launch-pwa")).toMatchObject({
      state: "warning",
      detail: expect.stringContaining("1 offline capture waiting to sync.")
    });
  });

  it("rolls missing app shell assets into PWA launch readiness", () => {
    const checklist = buildLaunchChecklist(buildReadinessItems({ ...readySnapshot, appShellCachedCount: 5 }));

    expect(checklist.find((item) => item.id === "launch-pwa")).toMatchObject({
      state: "warning",
      detail: expect.stringContaining("5/6 offline shell assets cached")
    });
  });

  it("marks missing server configuration clearly", () => {
    const items = buildServerReadinessItems(collectServerReadinessSnapshot({}));

    expect(items.find((item) => item.id === "server-supabase")?.state).toBe("blocked");
    expect(items.find((item) => item.id === "server-admin")?.state).toBe("blocked");
    expect(items.find((item) => item.id === "server-push")?.state).toBe("blocked");
    expect(items.find((item) => item.id === "server-cron")).toMatchObject({
      state: "blocked",
      detail: "CRON_SECRET is not set; production reminder sends fail closed until it is configured."
    });
  });
});
