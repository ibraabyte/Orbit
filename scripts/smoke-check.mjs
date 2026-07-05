#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const defaultSmokeOrigin = "http://localhost:3000";

export const smokeRoutes = [
  { path: "/", label: "Home redirect" },
  { path: "/sign-in", label: "Sign in route" },
  { path: "/sign-up", label: "Sign up route" },
  { path: "/dashboard", label: "Dashboard route" },
  { path: "/plan", label: "Plan route" },
  { path: "/review", label: "Review route" },
  { path: "/inbox", label: "Inbox route" },
  { path: "/focus", label: "Focus route" },
  { path: "/command", label: "Command route" },
  { path: "/search", label: "Search route" },
  { path: "/insights", label: "Insights route" },
  { path: "/tasks", label: "Tasks route" },
  { path: "/calendar", label: "Calendar route" },
  { path: "/health", label: "Health route" },
  { path: "/food", label: "Food route" },
  { path: "/finance", label: "Finance route" },
  { path: "/people", label: "People route" },
  { path: "/habits", label: "Habits route" },
  { path: "/goals", label: "Goals route" },
  { path: "/journal", label: "Journal route" },
  { path: "/library", label: "Library route" },
  { path: "/settings", label: "Settings route" },
  { path: "/share-target", label: "Share target route" }
];

const privateCacheControlDirectives = ["no-store", "must-revalidate"];
const pwaCacheControlDirectives = ["max-age=0", "must-revalidate"];

export const smokeTargets = [
  ...smokeRoutes.map((route) => ({ ...route, contentType: "text/html", cacheControl: privateCacheControlDirectives })),
  {
    path: "/manifest.webmanifest",
    label: "Web app manifest",
    contentType: "application/manifest+json",
    body: "manifest",
    cacheControl: pwaCacheControlDirectives
  },
  { path: "/sw.js", label: "Service worker", contentType: "javascript", body: "service-worker", cacheControl: pwaCacheControlDirectives },
  { path: "/robots.txt", label: "Robots policy", contentType: "text/plain", body: "robots" }
];

const requiredSecurityHeaders = [
  ["content-security-policy", "default-src 'self'"],
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-resource-policy", "same-origin"],
  ["origin-agent-cluster", "?1"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-robots-tag", "noindex"]
];

export async function runSmokeChecks({ origin = process.env.ORBIT_SMOKE_ORIGIN || defaultSmokeOrigin, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const results = [];

  for (const target of smokeTargets) {
    results.push(...(await checkTarget(normalizedOrigin, target, fetchImpl)));
  }

  return {
    ok: results.every((result) => result.ok),
    origin: normalizedOrigin,
    results
  };
}

export function parseSmokeCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--origin") {
      options.origin = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--origin=")) {
      options.origin = arg.slice("--origin=".length);
    }
  }

  return options;
}

export function formatSmokeReport(report) {
  const lines = [`Orbit smoke check ${report.ok ? "passed" : "failed"} for ${report.origin}.`];
  for (const result of report.results) {
    lines.push(`${result.ok ? "PASS" : "FAIL"} ${result.label}: ${result.detail}`);
  }
  return lines.join("\n");
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value || defaultSmokeOrigin);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid smoke origin: ${value}`);
  }
}

async function checkTarget(origin, target, fetchImpl) {
  const url = `${origin}${target.path}`;

  try {
    const response = await fetchImpl(url, { redirect: "follow" });
    const body = await response.text();
    const results = [
      checkStatus(target, response),
      checkContentType(target, response),
      ...checkSecurityHeaders(target, response),
      ...checkCacheControl(target, response)
    ];

    if (target.body === "manifest") results.push(...checkManifest(target, body));
    if (target.body === "service-worker") results.push(...checkServiceWorker(target, response, body));
    if (target.body === "robots") results.push(checkRobots(target, body));

    return results;
  } catch (error) {
    return [
      {
        ok: false,
        label: target.label,
        detail: error instanceof Error ? error.message : "Request failed."
      }
    ];
  }
}

function checkStatus(target, response) {
  return {
    ok: response.status === 200,
    label: `${target.label} status`,
    detail: `${response.status} ${response.statusText || ""}`.trim()
  };
}

function checkContentType(target, response) {
  const contentType = response.headers.get("content-type") ?? "";
  return {
    ok: contentType.toLowerCase().includes(target.contentType),
    label: `${target.label} content type`,
    detail: contentType || "missing content-type"
  };
}

function checkSecurityHeaders(target, response) {
  return requiredSecurityHeaders.map(([header, expected]) => {
    const value = response.headers.get(header) ?? "";
    return {
      ok: value.toLowerCase().includes(expected.toLowerCase()),
      label: `${target.label} ${header}`,
      detail: value || "missing header"
    };
  });
}

function checkCacheControl(target, response) {
  if (!target.cacheControl) return [];

  const value = response.headers.get("cache-control") ?? "";
  const expectedDirectives = Array.isArray(target.cacheControl) ? target.cacheControl : [target.cacheControl];
  return [
    {
      ok: expectedDirectives.every((directive) => value.toLowerCase().includes(directive.toLowerCase())),
      label: `${target.label} cache-control`,
      detail: value || "missing cache-control"
    }
  ];
}

function checkManifest(target, body) {
  try {
    const manifest = JSON.parse(body);
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const shortcuts = Array.isArray(manifest.shortcuts) ? manifest.shortcuts : [];
    return [
      {
        ok: manifest.name === "Orbit" && manifest.start_url === "/dashboard" && manifest.display === "standalone",
        label: `${target.label} install metadata`,
        detail: `${manifest.name ?? "unknown"} ${manifest.start_url ?? "missing start_url"} ${manifest.display ?? "missing display"}`
      },
      {
        ok: manifest.share_target?.action === "/share-target" && manifest.share_target?.method === "POST",
        label: `${target.label} share target`,
        detail: manifest.share_target?.action ?? "missing share target"
      },
      {
        ok: icons.length >= 2 && icons.some((icon) => String(icon.purpose ?? "").includes("maskable")),
        label: `${target.label} icons`,
        detail: `${icons.length} icons`
      },
      {
        ok: shortcuts.length >= 4,
        label: `${target.label} shortcuts`,
        detail: `${shortcuts.length} shortcuts`
      }
    ];
  } catch {
    return [
      {
        ok: false,
        label: `${target.label} JSON`,
        detail: "Manifest could not be parsed."
      }
    ];
  }
}

function checkServiceWorker(target, response, body) {
  return [
    {
      ok: response.headers.get("service-worker-allowed") === "/",
      label: `${target.label} scope`,
      detail: response.headers.get("service-worker-allowed") ?? "missing Service-Worker-Allowed"
    },
    {
      ok: body.includes("orbit-shell-v") && body.includes("handleShareTargetPost") && body.includes("showNotification"),
      label: `${target.label} capabilities`,
      detail: "offline shell, share target, and push handlers"
    }
  ];
}

function checkRobots(target, body) {
  return {
    ok: /User-agent:\s*\*/i.test(body) && /Disallow:\s*\//i.test(body),
    label: `${target.label} disallow all`,
    detail: body.trim().split(/\r?\n/).slice(0, 2).join(" ")
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const report = await runSmokeChecks(parseSmokeCliArgs(process.argv.slice(2)));
    const formatted = formatSmokeReport(report);
    if (report.ok) {
      console.log(formatted);
    } else {
      console.error(formatted);
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Smoke check failed.");
    process.exitCode = 1;
  }
}
