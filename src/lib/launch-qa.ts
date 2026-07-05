export type LaunchQaGroup = "setup" | "device" | "workflow" | "data";

export type LaunchQaStep = {
  id: string;
  group: LaunchQaGroup;
  label: string;
  detail: string;
};

export type LaunchQaStatus = Record<string, boolean>;

export type LaunchQaEvidenceEntry = {
  note?: string;
  checkedAt?: string;
};

export type LaunchQaEvidence = Record<string, LaunchQaEvidenceEntry>;

export type LaunchQaEvidenceSummary = {
  checked: number;
  withEvidence: number;
  checkedWithoutEvidence: number;
};

export type LaunchQaGateState = "unchecked" | "needs-evidence" | "ready";

export type LaunchQaGateSummary = {
  ready: boolean;
  state: LaunchQaGateState;
  label: string;
  detail: string;
  checked: number;
  total: number;
  remaining: number;
  evidenceMissing: number;
  evidenceProvided: number;
  nextStep: LaunchQaStep | null;
};

export type LaunchQaReportCheck = {
  label: string;
  detail: string;
  state: string;
};

export type LaunchQaReportSection = {
  title: string;
  items: LaunchQaReportCheck[];
};

export const launchQaStorageKey = "orbit.launchQa.v1";
export const launchQaEvidenceStorageKey = "orbit.launchQaEvidence.v1";

export const launchQaGroupOrder: LaunchQaGroup[] = ["setup", "device", "workflow", "data"];

export const launchQaGroupLabels: Record<LaunchQaGroup, string> = {
  setup: "Production setup",
  device: "Device checks",
  workflow: "Workflow pass",
  data: "Data safety"
};

export const launchQaSteps: LaunchQaStep[] = [
  {
    id: "supabase-auth-redirects",
    group: "setup",
    label: "Supabase auth redirects",
    detail: "Production and local callback URLs are configured in Supabase Auth."
  },
  {
    id: "vercel-env",
    group: "setup",
    label: "Vercel environment",
    detail: "All public, service-role, VAPID, and cron environment variables are set."
  },
  {
    id: "vercel-cron-reminders",
    group: "setup",
    label: "Cron reminder send",
    detail: "Vercel Cron reaches /api/reminders/send with CRON_SECRET."
  },
  {
    id: "desktop-pwa-install",
    group: "device",
    label: "Desktop PWA install",
    detail: "Installed and launched from Chrome or Edge on desktop."
  },
  {
    id: "android-pwa-install",
    group: "device",
    label: "Android PWA install",
    detail: "Installed from Android Chrome and reopened from the home screen."
  },
  {
    id: "ios-pwa-install",
    group: "device",
    label: "iOS PWA install",
    detail: "Installed from Safari and reopened from the iOS home screen."
  },
  {
    id: "desktop-push",
    group: "device",
    label: "Desktop push reminder",
    detail: "Task and standalone reminder pushes arrive on desktop."
  },
  {
    id: "android-push",
    group: "device",
    label: "Android push reminder",
    detail: "Task and standalone reminder pushes arrive on Android Chrome."
  },
  {
    id: "ios-push",
    group: "device",
    label: "iOS installed PWA push",
    detail: "Task and standalone reminder pushes arrive in the installed iOS app."
  },
  {
    id: "signup-onboarding",
    group: "workflow",
    label: "Signup and onboarding",
    detail: "A new account can complete the setup guidance without dead ends."
  },
  {
    id: "inbox-triage",
    group: "workflow",
    label: "Inbox triage",
    detail: "Overdue, undated, stale, and missing-log actions resolve correctly."
  },
  {
    id: "weekly-plan-review",
    group: "workflow",
    label: "Weekly plan and review",
    detail: "Weekly plan loads, review saves, and journal output is created."
  },
  {
    id: "tasks-reminders",
    group: "workflow",
    label: "Tasks and reminders",
    detail: "Task create, recurrence, completion, snooze, and reminder paths work."
  },
  {
    id: "people-followups",
    group: "workflow",
    label: "People follow-ups",
    detail: "People, favorites, follow-ups, and birthdays show in planning."
  },
  {
    id: "food-groceries",
    group: "workflow",
    label: "Food and groceries",
    detail: "Meal plan, one-tap meal logging, grocery purchase, and tags work."
  },
  {
    id: "capture-library",
    group: "workflow",
    label: "Capture and library",
    detail: "Links, screenshots, social filters, task creation, and signed files work."
  },
  {
    id: "mobile-share-target",
    group: "workflow",
    label: "Mobile share target",
    detail: "Sharing a link, text, and multiple images into Orbit creates captures."
  },
  {
    id: "command-quick-add",
    group: "workflow",
    label: "Command quick add",
    detail: "One-line entry creates tasks, reminders, captures, meals, logs, and tags."
  },
  {
    id: "search-calendar-insights",
    group: "workflow",
    label: "Search, calendar, insights",
    detail: "Global search, calendar agenda/export, and insights reflect new data."
  },
  {
    id: "health-finance-routines",
    group: "workflow",
    label: "Health, finance, habits, goals",
    detail: "Sleep, weight, workouts, expenses, bills, habits, and milestones update."
  },
  {
    id: "journal-entry",
    group: "workflow",
    label: "Journal entry",
    detail: "Daily journal and mood history save and reappear after reload."
  },
  {
    id: "backup-export-import",
    group: "data",
    label: "Full export and import",
    detail: "Production export restores into another account without deleting data."
  },
  {
    id: "delete-account",
    group: "data",
    label: "Delete account",
    detail: "Account deletion removes owner data, storage files, and the auth user."
  }
];

const knownStepIds = new Set(launchQaSteps.map((step) => step.id));

export function normalizeLaunchQaStatus(input: unknown): LaunchQaStatus {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([id, checked]) => knownStepIds.has(id) && checked === true)
      .map(([id]) => [id, true])
  );
}

export function normalizeLaunchQaEvidence(input: unknown): LaunchQaEvidence {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).flatMap(([id, value]) => {
      if (!knownStepIds.has(id) || !value || typeof value !== "object" || Array.isArray(value)) return [];

      const entry = value as Record<string, unknown>;
      const note = typeof entry.note === "string" ? entry.note : "";
      const checkedAt = typeof entry.checkedAt === "string" ? entry.checkedAt : "";
      const normalized: LaunchQaEvidenceEntry = {};

      if (note.trim()) normalized.note = note;
      if (checkedAt) normalized.checkedAt = checkedAt;

      return Object.keys(normalized).length ? [[id, normalized]] : [];
    })
  );
}

export function summarizeLaunchQa(status: LaunchQaStatus, steps: LaunchQaStep[] = launchQaSteps) {
  const completed = steps.filter((step) => Boolean(status[step.id])).length;
  return {
    completed,
    remaining: steps.length - completed,
    total: steps.length
  };
}

export function summarizeLaunchQaEvidence(
  status: LaunchQaStatus,
  evidence: LaunchQaEvidence = {},
  steps: LaunchQaStep[] = launchQaSteps
): LaunchQaEvidenceSummary {
  const checkedSteps = steps.filter((step) => Boolean(status[step.id]));
  const withEvidence = checkedSteps.filter((step) => Boolean(evidence[step.id]?.note?.trim())).length;

  return {
    checked: checkedSteps.length,
    withEvidence,
    checkedWithoutEvidence: checkedSteps.length - withEvidence
  };
}

export function summarizeLaunchQaGroups(status: LaunchQaStatus, steps: LaunchQaStep[] = launchQaSteps) {
  return launchQaGroupOrder
    .map((group) => {
      const groupSteps = steps.filter((step) => step.group === group);
      const summary = summarizeLaunchQa(status, groupSteps);
      return {
        group,
        label: launchQaGroupLabels[group],
        steps: groupSteps,
        ...summary
      };
    })
    .filter((summary) => summary.total > 0);
}

export function nextLaunchQaStep(status: LaunchQaStatus, steps: LaunchQaStep[] = launchQaSteps) {
  return steps.find((step) => !status[step.id]) ?? null;
}

export function launchQaCompletionLabel(status: LaunchQaStatus, steps: LaunchQaStep[] = launchQaSteps) {
  const summary = summarizeLaunchQa(status, steps);
  return `${summary.completed}/${summary.total} checked`;
}

export function summarizeLaunchQaGate(
  status: LaunchQaStatus,
  evidence: LaunchQaEvidence = {},
  steps: LaunchQaStep[] = launchQaSteps
): LaunchQaGateSummary {
  const summary = summarizeLaunchQa(status, steps);
  const evidenceSummary = summarizeLaunchQaEvidence(status, evidence, steps);
  const nextStep = nextLaunchQaStep(status, steps);
  const base = {
    checked: summary.completed,
    total: summary.total,
    remaining: summary.remaining,
    evidenceMissing: evidenceSummary.checkedWithoutEvidence,
    evidenceProvided: evidenceSummary.withEvidence,
    nextStep
  };

  if (summary.remaining > 0) {
    return {
      ...base,
      ready: false,
      state: "unchecked",
      label: "Manual gate open",
      detail: `${summary.remaining} manual QA step${summary.remaining === 1 ? "" : "s"} remain.`
    };
  }

  if (evidenceSummary.checkedWithoutEvidence > 0) {
    return {
      ...base,
      ready: false,
      state: "needs-evidence",
      label: "Manual gate needs evidence",
      detail: `${evidenceSummary.checkedWithoutEvidence} checked item${evidenceSummary.checkedWithoutEvidence === 1 ? "" : "s"} need evidence notes.`
    };
  }

  return {
    ...base,
    ready: true,
    state: "ready",
    label: "Manual gate clear",
    detail: "All manual QA steps are checked and evidenced."
  };
}

export function buildLaunchQaReport(
  status: LaunchQaStatus,
  options: {
    automatedCheckSections?: LaunchQaReportSection[];
    evidence?: LaunchQaEvidence;
    generatedAt?: string;
    steps?: LaunchQaStep[];
  } = {}
) {
  const steps = options.steps ?? launchQaSteps;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const summary = summarizeLaunchQa(status, steps);
  const evidenceSummary = summarizeLaunchQaEvidence(status, options.evidence, steps);
  const gate = summarizeLaunchQaGate(status, options.evidence, steps);
  const groups = summarizeLaunchQaGroups(status, steps);
  const automatedCheckSections = options.automatedCheckSections?.filter((section) => section.items.length) ?? [];
  const evidenceCount = steps.filter((step) => options.evidence?.[step.id]?.note?.trim()).length;
  const lines = [
    "Orbit launch QA",
    `Generated: ${generatedAt}`,
    `Manual progress: ${summary.completed}/${summary.total} checked (${summary.remaining} remaining)`,
    `${gate.label}: ${gate.detail}`,
    ""
  ];

  if (automatedCheckSections.length) {
    const automatedSummary = summarizeAutomatedChecks(automatedCheckSections);
    lines.push(
      "Automated readiness",
      `Status: ${automatedSummary.ready} ready, ${automatedSummary.warning} warning, ${automatedSummary.blocked} blocked, ${automatedSummary.checking} checking`,
      ""
    );

    for (const section of automatedCheckSections) {
      const sectionSummary = summarizeAutomatedChecks([section]);
      lines.push(`${section.title}: ${sectionSummary.ready}/${sectionSummary.total} ready`);
      for (const item of section.items) {
        lines.push(`[${item.state}] ${item.label} - ${item.detail}`);
      }
      lines.push("");
    }
  }

  lines.push("Manual production QA", `Progress: ${summary.completed}/${summary.total} checked (${summary.remaining} remaining)`, `${gate.label}: ${gate.detail}`, "");
  if (evidenceCount > 0) {
    lines.push(`Evidence notes: ${evidenceCount} captured`, "");
  }
  if (evidenceSummary.checkedWithoutEvidence > 0) {
    lines.push(`Evidence gaps: ${evidenceSummary.checkedWithoutEvidence} checked item${evidenceSummary.checkedWithoutEvidence === 1 ? "" : "s"} missing notes`, "");
  }

  for (const group of groups) {
    lines.push(`${group.label}: ${group.completed}/${group.total} checked`);
    for (const step of group.steps) {
      lines.push(`${status[step.id] ? "[x]" : "[ ]"} ${step.label} - ${step.detail}`);
      const evidence = options.evidence?.[step.id];
      if (evidence?.checkedAt) {
        lines.push(`    Checked at: ${evidence.checkedAt}`);
      }
      if (status[step.id] && !evidence?.note?.trim()) {
        lines.push("    Evidence: Missing evidence note.");
      }
      if (evidence?.note?.trim()) {
        lines.push(`    Evidence: ${formatEvidenceNote(evidence.note)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function summarizeAutomatedChecks(sections: LaunchQaReportSection[]) {
  const items = sections.flatMap((section) => section.items);
  return {
    ready: items.filter((item) => item.state === "ready").length,
    warning: items.filter((item) => item.state === "warning").length,
    blocked: items.filter((item) => item.state === "blocked").length,
    checking: items.filter((item) => item.state === "checking").length,
    total: items.length
  };
}

function formatEvidenceNote(note: string) {
  return note.replace(/\s+/g, " ").trim();
}
