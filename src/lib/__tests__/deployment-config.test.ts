import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  crons?: Array<{ path?: string; schedule?: string }>;
};

const requiredEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "CRON_SECRET"
];
const optionalLaunchEnvKeys = ["ORBIT_SMOKE_ORIGIN"];

describe("deployment configuration", () => {
  it("keeps the environment template aligned with required production settings", () => {
    for (const key of [...requiredEnvKeys, ...optionalLaunchEnvKeys]) {
      expect(envExample).toMatch(new RegExp(`^${key}=.+`, "m"));
    }
  });

  it("defines one-command local verification and dependency audit scripts", () => {
    expect(packageJson.scripts?.verify).toContain("npm run typecheck");
    expect(packageJson.scripts?.verify).toContain("npm run lint");
    expect(packageJson.scripts?.verify).toContain("npm test");
    expect(packageJson.scripts?.verify).toContain("npm run build");
    expect(packageJson.scripts?.audit).toBe("npm audit --audit-level=moderate");
    expect(packageJson.scripts?.preflight).toBe("node scripts/deployment-preflight.mjs");
    expect(packageJson.scripts?.["migrations:bundle"]).toBe("node scripts/migration-bundle.mjs");
    expect(packageJson.scripts?.smoke).toBe("node scripts/smoke-check.mjs");
  });

  it("defines a VAPID key generation helper", () => {
    expect(packageJson.scripts?.["vapid:generate"]).toBe("web-push generate-vapid-keys --json");
  });

  it("schedules the reminder sender through Vercel Cron", () => {
    expect(vercelConfig.crons).toEqual([
      {
        path: "/api/reminders/send",
        schedule: "*/5 * * * *"
      }
    ]);
  });

  it("defines conservative browser security headers", async () => {
    const nextConfig = await loadNextConfig();
    const rules = await nextConfig.headers();
    const appHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/:path*")?.headers ?? []).map((header) => [header.key, header.value]));

    expect(nextConfig.poweredByHeader).toBe(false);
    expect(appHeaders).toMatchObject({
      "Content-Security-Policy": expect.stringContaining("default-src 'self'"),
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Origin-Agent-Cluster": "?1",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex"
    });
    expect(appHeaders["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(appHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(appHeaders["Content-Security-Policy"]).toContain("connect-src 'self' https: ws: wss:");
    expect(appHeaders["Content-Security-Policy"]).toContain("worker-src 'self' blob:");
  });

  it("keeps PWA update assets fresh and scoped", async () => {
    const nextConfig = await loadNextConfig();
    const rules = await nextConfig.headers();
    const serviceWorkerHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/sw.js")?.headers ?? []).map((header) => [header.key, header.value]));
    const manifestHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/manifest.webmanifest")?.headers ?? []).map((header) => [header.key, header.value]));

    expect(serviceWorkerHeaders).toMatchObject({
      "Service-Worker-Allowed": "/",
      "Cache-Control": "public, max-age=0, must-revalidate"
    });
    expect(manifestHeaders).toMatchObject({
      "Cache-Control": "public, max-age=0, must-revalidate"
    });
  });

  it("marks personal app routes and APIs as private no-store surfaces", async () => {
    const nextConfig = await loadNextConfig();
    const rules = await nextConfig.headers();
    const dashboardHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/dashboard")?.headers ?? []).map((header) => [header.key, header.value]));
    const settingsHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/settings")?.headers ?? []).map((header) => [header.key, header.value]));
    const shareTargetHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/share-target")?.headers ?? []).map((header) => [header.key, header.value]));
    const apiHeaders = Object.fromEntries((rules.find((rule) => rule.source === "/api/:path*")?.headers ?? []).map((header) => [header.key, header.value]));

    expect(dashboardHeaders).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0, must-revalidate"
    });
    expect(settingsHeaders).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0, must-revalidate"
    });
    expect(shareTargetHeaders).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0, must-revalidate"
    });
    expect(apiHeaders).toMatchObject({
      "Cache-Control": "private, no-store, max-age=0, must-revalidate"
    });
  });
});

async function loadNextConfig() {
  const importedConfig = (await import(pathToFileURL(join(process.cwd(), "next.config.mjs")).href)) as {
    default: {
      poweredByHeader?: boolean;
      headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    };
  };

  return importedConfig.default;
}
