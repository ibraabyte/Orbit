import { describe, expect, it } from "vitest";
import {
  buildLaunchQaReport,
  launchQaCompletionLabel,
  launchQaSteps,
  nextLaunchQaStep,
  normalizeLaunchQaEvidence,
  normalizeLaunchQaStatus,
  summarizeLaunchQa,
  summarizeLaunchQaGate,
  summarizeLaunchQaEvidence,
  summarizeLaunchQaGroups
} from "@/lib/launch-qa";

describe("launch QA checklist", () => {
  it("keeps stable unique checklist ids", () => {
    const ids = launchQaSteps.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "supabase-auth-redirects",
        "vercel-cron-reminders",
        "ios-push",
        "mobile-share-target",
        "backup-export-import",
        "delete-account"
      ])
    );
  });

  it("normalizes persisted status to known checked steps only", () => {
    expect(
      normalizeLaunchQaStatus({
        "desktop-pwa-install": true,
        "android-push": false,
        unknown: true
      })
    ).toEqual({ "desktop-pwa-install": true });
    expect(normalizeLaunchQaStatus(["desktop-pwa-install"])).toEqual({});
    expect(normalizeLaunchQaStatus(null)).toEqual({});
  });

  it("normalizes persisted evidence to known launch steps", () => {
    expect(
      normalizeLaunchQaEvidence({
        "desktop-pwa-install": {
          note: "Chrome on Mac, launched from dock.",
          checkedAt: "2026-07-01T08:00:00.000Z"
        },
        "android-push": {
          note: ""
        },
        unknown: {
          note: "Ignore me"
        }
      })
    ).toEqual({
      "desktop-pwa-install": {
        note: "Chrome on Mac, launched from dock.",
        checkedAt: "2026-07-01T08:00:00.000Z"
      }
    });
    expect(normalizeLaunchQaEvidence(["desktop-pwa-install"])).toEqual({});
    expect(normalizeLaunchQaEvidence(null)).toEqual({});
  });

  it("summarizes completion", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true,
      "vercel-env": true,
      "delete-account": true
    });

    expect(summarizeLaunchQa(status)).toEqual({
      completed: 3,
      remaining: launchQaSteps.length - 3,
      total: launchQaSteps.length
    });
    expect(launchQaCompletionLabel(status)).toBe(`3/${launchQaSteps.length} checked`);
  });

  it("summarizes checked evidence coverage", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true,
      "desktop-pwa-install": true,
      "android-push": true,
      "ios-push": false
    });
    const evidence = normalizeLaunchQaEvidence({
      "supabase-auth-redirects": {
        note: "Supabase auth screen has local and production callbacks."
      },
      "desktop-pwa-install": {
        note: ""
      },
      "android-push": {
        note: "Android Chrome push received."
      }
    });

    expect(summarizeLaunchQaEvidence(status, evidence)).toEqual({
      checked: 3,
      withEvidence: 2,
      checkedWithoutEvidence: 1
    });
  });

  it("summarizes progress by launch QA group", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true,
      "desktop-pwa-install": true,
      "delete-account": true
    });

    expect(summarizeLaunchQaGroups(status)).toEqual([
      expect.objectContaining({ group: "setup", label: "Production setup", completed: 1, total: 3, remaining: 2 }),
      expect.objectContaining({ group: "device", label: "Device checks", completed: 1, total: 6, remaining: 5 }),
      expect.objectContaining({ group: "workflow", label: "Workflow pass", completed: 0, total: 12, remaining: 12 }),
      expect.objectContaining({ group: "data", label: "Data safety", completed: 1, total: 2, remaining: 1 })
    ]);
  });

  it("finds the next unchecked production QA step", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true,
      "vercel-env": true
    });

    expect(nextLaunchQaStep(status)?.id).toBe("vercel-cron-reminders");
    expect(nextLaunchQaStep(Object.fromEntries(launchQaSteps.map((step) => [step.id, true])))).toBeNull();
  });

  it("separates checked QA from launch-ready QA", () => {
    const allChecked = normalizeLaunchQaStatus(Object.fromEntries(launchQaSteps.map((step) => [step.id, true])));
    const allEvidence = normalizeLaunchQaEvidence(
      Object.fromEntries(
        launchQaSteps.map((step) => [
          step.id,
          {
            note: `${step.label} passed on production.`
          }
        ])
      )
    );

    expect(summarizeLaunchQaGate(normalizeLaunchQaStatus({ "supabase-auth-redirects": true }))).toMatchObject({
      ready: false,
      state: "unchecked",
      label: "Manual gate open",
      nextStep: expect.objectContaining({ id: "vercel-env" })
    });
    expect(summarizeLaunchQaGate(allChecked)).toMatchObject({
      ready: false,
      state: "needs-evidence",
      label: "Manual gate needs evidence",
      evidenceMissing: launchQaSteps.length
    });
    expect(summarizeLaunchQaGate(allChecked, allEvidence)).toMatchObject({
      ready: true,
      state: "ready",
      label: "Manual gate clear",
      evidenceMissing: 0
    });
  });

  it("builds a copyable launch QA report", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true,
      "desktop-pwa-install": true
    });

    expect(buildLaunchQaReport(status, { generatedAt: "2026-07-01T08:00:00.000Z" })).toContain(
      [
        "Orbit launch QA",
        "Generated: 2026-07-01T08:00:00.000Z",
        `Manual progress: 2/${launchQaSteps.length} checked (${launchQaSteps.length - 2} remaining)`,
        `Manual gate open: ${launchQaSteps.length - 2} manual QA steps remain.`,
        "",
        "Manual production QA",
        `Progress: 2/${launchQaSteps.length} checked (${launchQaSteps.length - 2} remaining)`,
        `Manual gate open: ${launchQaSteps.length - 2} manual QA steps remain.`,
        "",
        "Evidence gaps: 2 checked items missing notes",
        "",
        "Production setup: 1/3 checked",
        "[x] Supabase auth redirects - Production and local callback URLs are configured in Supabase Auth.",
        "    Evidence: Missing evidence note.",
        "[ ] Vercel environment - All public, service-role, VAPID, and cron environment variables are set.",
        "[ ] Cron reminder send - Vercel Cron reaches /api/reminders/send with CRON_SECRET."
      ].join("\n")
    );
  });

  it("includes manual evidence notes in the copied report", () => {
    const status = normalizeLaunchQaStatus({
      "desktop-pwa-install": true
    });
    const evidence = normalizeLaunchQaEvidence({
      "desktop-pwa-install": {
        checkedAt: "2026-07-01T08:00:00.000Z",
        note: "Chrome 126 on MacBook.\nOpened from Dock and loaded dashboard offline."
      },
      "android-push": {
        note: "Pending physical device."
      }
    });

    expect(buildLaunchQaReport(status, { generatedAt: "2026-07-01T08:05:00.000Z", evidence })).toContain(
      [
        "Evidence notes: 2 captured",
        "",
        "Production setup: 0/3 checked",
        "[ ] Supabase auth redirects - Production and local callback URLs are configured in Supabase Auth.",
        "[ ] Vercel environment - All public, service-role, VAPID, and cron environment variables are set.",
        "[ ] Cron reminder send - Vercel Cron reaches /api/reminders/send with CRON_SECRET.",
        "",
        "Device checks: 1/6 checked",
        "[x] Desktop PWA install - Installed and launched from Chrome or Edge on desktop.",
        "    Checked at: 2026-07-01T08:00:00.000Z",
        "    Evidence: Chrome 126 on MacBook. Opened from Dock and loaded dashboard offline."
      ].join("\n")
    );
    expect(buildLaunchQaReport(status, { generatedAt: "2026-07-01T08:05:00.000Z", evidence })).toContain(
      "[ ] Android push reminder - Task and standalone reminder pushes arrive on Android Chrome.\n    Evidence: Pending physical device."
    );
  });

  it("includes automated readiness checks in the copied report", () => {
    const status = normalizeLaunchQaStatus({
      "supabase-auth-redirects": true
    });

    expect(
      buildLaunchQaReport(status, {
        generatedAt: "2026-07-01T08:00:00.000Z",
        automatedCheckSections: [
          {
            title: "Device readiness",
            items: [
              { label: "Service worker", detail: "Registered and controlling this page.", state: "ready" },
              { label: "Push reminders", detail: "Permission has not been granted on this device.", state: "warning" }
            ]
          },
          {
            title: "Launch checklist",
            items: [{ label: "Production environment", detail: "Missing SUPABASE_SERVICE_ROLE_KEY.", state: "blocked" }]
          }
        ]
      })
    ).toContain(
      [
        "Automated readiness",
        "Status: 1 ready, 1 warning, 1 blocked, 0 checking",
        "",
        "Device readiness: 1/2 ready",
        "[ready] Service worker - Registered and controlling this page.",
        "[warning] Push reminders - Permission has not been granted on this device.",
        "",
        "Launch checklist: 0/1 ready",
        "[blocked] Production environment - Missing SUPABASE_SERVICE_ROLE_KEY."
      ].join("\n")
    );
  });
});
