import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type DeploymentPreflightModule = {
  parseDotEnv: (content: string) => Record<string, string>;
  validateProductionEnv: (env: Record<string, string>, options?: { allowLocalSupabase?: boolean }) => string[];
  validateVercelCron: (cwd: string) => string[];
  validateSmokeOrigin: (value?: string) => {
    origin: string | null;
    errors: string[];
    warnings: string[];
  };
  validateMigrationBundle: (cwd: string) => {
    count: number;
    sourceChecksum: string | null;
    errors: string[];
  };
  buildDeploymentPreflightReport: (options: {
    cwd: string;
    env?: Record<string, string>;
    envFile?: string | null;
    allowLocalSupabase?: boolean;
    smokeOrigin?: string;
  }) => {
    ok: boolean;
    errors: string[];
    warnings: string[];
    smokeOrigin: string | null;
    smokeCommand: string | null;
    migrationCount: number;
    migrationSourceChecksum: string | null;
  };
};

let preflight: DeploymentPreflightModule;

beforeAll(async () => {
  preflight = (await import(pathToFileURL(join(process.cwd(), "scripts", "deployment-preflight.mjs")).href)) as DeploymentPreflightModule;
});

describe("deployment preflight", () => {
  it("parses simple dotenv files", () => {
    expect(preflight.parseDotEnv("# Orbit\nCRON_SECRET='abc123'\nVAPID_SUBJECT=mailto:ops@orbit.app\n")).toEqual({
      CRON_SECRET: "abc123",
      VAPID_SUBJECT: "mailto:ops@orbit.app"
    });
  });

  it("accepts production-ready environment values", () => {
    expect(preflight.validateProductionEnv(productionEnv())).toEqual([]);
  });

  it("rejects placeholders, local Supabase URLs, weak secrets, and invalid VAPID subjects", () => {
    const errors = preflight.validateProductionEnv({
      ...productionEnv(),
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "replace-with-supabase-anon-key",
      VAPID_SUBJECT: "mailto:you@example.com",
      CRON_SECRET: "short"
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SUPABASE_URL must use HTTPS for production.",
        "NEXT_PUBLIC_SUPABASE_URL points at a local Supabase instance.",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY still looks like a placeholder.",
        "VAPID_SUBJECT still looks like a placeholder.",
        "CRON_SECRET must be at least 32 characters."
      ])
    );
  });

  it("validates the production smoke-check origin", () => {
    expect(preflight.validateSmokeOrigin("https://orbit.app/settings")).toEqual({
      origin: "https://orbit.app",
      errors: [],
      warnings: ["ORBIT_SMOKE_ORIGIN will be normalized to https://orbit.app."]
    });
    expect(preflight.validateSmokeOrigin("https://your-production-domain.example")).toEqual({
      origin: null,
      errors: ["ORBIT_SMOKE_ORIGIN still looks like a placeholder."],
      warnings: []
    });
    expect(preflight.validateSmokeOrigin("http://localhost:3000")).toEqual({
      origin: null,
      errors: ["ORBIT_SMOKE_ORIGIN must use HTTPS for production smoke checks.", "ORBIT_SMOKE_ORIGIN points at a local development server."],
      warnings: []
    });
    expect(preflight.validateSmokeOrigin()).toEqual({
      origin: null,
      errors: [],
      warnings: ["ORBIT_SMOKE_ORIGIN is not set; pass --origin to npm run smoke after deploy."]
    });
  });

  it("checks env files and the Vercel cron schedule together", () => {
    const cwd = tempProject();
    writeFileSync(join(cwd, ".env.production"), envFile(productionEnv()));
    writeFileSync(join(cwd, "vercel.json"), JSON.stringify({ crons: [{ path: "/api/reminders/send", schedule: "*/5 * * * *" }] }));
    writeMigrations(cwd, ["0001_initial.sql", "0002_next.sql"]);

    try {
      expect(preflight.buildDeploymentPreflightReport({ cwd, env: {}, envFile: ".env.production" })).toMatchObject({
        ok: true,
        errors: [],
        warnings: [],
        smokeOrigin: "https://orbit.app",
        smokeCommand: "npm run smoke -- --origin https://orbit.app",
        migrationCount: 2,
        migrationSourceChecksum: expect.stringMatching(/^[a-f0-9]{64}$/)
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("fails preflight when Supabase migrations are missing or out of sequence", () => {
    const missingProject = tempProject();
    const gapProject = tempProject();
    writeMigrations(gapProject, ["0001_initial.sql", "0003_later.sql"]);

    try {
      expect(preflight.validateMigrationBundle(missingProject)).toEqual({
        count: 0,
        sourceChecksum: null,
        errors: ["Supabase migrations: supabase/migrations is missing."]
      });
      expect(preflight.validateMigrationBundle(gapProject)).toEqual({
        count: 0,
        sourceChecksum: null,
        errors: ["Supabase migrations: 0003_later.sql should use prefix 0002 to keep migrations contiguous."]
      });
    } finally {
      rmSync(missingProject, { recursive: true, force: true });
      rmSync(gapProject, { recursive: true, force: true });
    }
  });

  it("fails when the Vercel reminder cron is missing", () => {
    const cwd = tempProject();
    writeFileSync(join(cwd, "vercel.json"), JSON.stringify({ crons: [] }));

    try {
      expect(preflight.validateVercelCron(cwd)).toEqual(["vercel.json must schedule /api/reminders/send as */5 * * * *."]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

function productionEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://orbit-prod.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon.production",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "B".repeat(88),
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.production",
    VAPID_PRIVATE_KEY: "_".repeat(43),
    VAPID_SUBJECT: "mailto:ops@orbit.app",
    CRON_SECRET: "orbit-production-cron-secret-123456",
    ORBIT_SMOKE_ORIGIN: "https://orbit.app"
  };
}

function envFile(env: Record<string, string>) {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "orbit-preflight-"));
}

function writeMigrations(cwd: string, fileNames: string[]) {
  const migrationsPath = join(cwd, "supabase", "migrations");
  mkdirSync(migrationsPath, { recursive: true });
  for (const fileName of fileNames) {
    writeFileSync(join(migrationsPath, fileName), `-- ${fileName}\nselect 1;`);
  }
}
