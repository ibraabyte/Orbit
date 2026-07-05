import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

type MigrationBundleModule = {
  buildMigrationBundle: (options?: { cwd?: string; generatedAt?: string }) => {
    ok: boolean;
    errors: string[];
    migrations: Array<{ fileName: string; sql: string }>;
    sql: string | null;
    sourceChecksum: string | null;
    bundleChecksum: string | null;
    bytes: number;
  };
  parseMigrationBundleCliArgs: (argv: string[]) => { check: boolean; out: string | null };
  validateMigrationFileNames: (fileNames: string[]) => string[];
};

let migrationBundle: MigrationBundleModule;

beforeAll(async () => {
  migrationBundle = (await import(pathToFileURL(join(process.cwd(), "scripts", "migration-bundle.mjs")).href)) as MigrationBundleModule;
});

describe("migration bundle", () => {
  it("builds one ordered SQL bundle from the real Supabase migrations", () => {
    const report = migrationBundle.buildMigrationBundle({ generatedAt: "2026-07-01T12:00:00.000Z" });

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.migrations.map((migration) => migration.fileName)).toEqual([
      "0001_initial_schema.sql",
      "0002_habits.sql",
      "0003_goals_journal.sql",
      "0004_profile_preferences.sql",
      "0005_finance.sql",
      "0006_sleep.sql",
      "0007_focus_sessions.sql",
      "0008_food_planning.sql",
      "0009_people.sql",
      "0010_task_reminder_sent_at.sql",
      "0011_dashboard_preferences.sql",
      "0012_macro_targets.sql",
      "0013_owner_reference_guards.sql",
      "0014_owner_query_indexes.sql"
    ]);
    expect(report.sourceChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(report.bundleChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(report.bytes).toBeGreaterThan(10_000);
    expect(report.sql).toContain("-- Orbit Supabase migration bundle");
    expect(report.sql).toContain("-- Generated: 2026-07-01T12:00:00.000Z");
    expect(report.sql).toContain("-- 0001_initial_schema.sql");
    expect(report.sql).toContain("-- 0014_owner_query_indexes.sql");
    expect(report.sql).toContain("\nbegin;\n");
    expect(report.sql?.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("rejects migration filename gaps, duplicate prefixes, and malformed names", () => {
    expect(migrationBundle.validateMigrationFileNames(["0001_initial.sql", "0003_later.sql"])).toEqual([
      "0003_later.sql should use prefix 0002 to keep migrations contiguous."
    ]);
    expect(migrationBundle.validateMigrationFileNames(["0001_initial.sql", "0001_duplicate.sql"])).toEqual([
      "Migration prefix 0001 is duplicated.",
      "0001_duplicate.sql should use prefix 0002 to keep migrations contiguous."
    ]);
    expect(migrationBundle.validateMigrationFileNames(["1_initial.sql"])).toEqual([
      "1_initial.sql must use a four-digit numeric prefix, for example 0001_initial_schema.sql."
    ]);
  });

  it("reports missing migration directories clearly", () => {
    const cwd = mkdtempSync(join(tmpdir(), "orbit-migrations-missing-"));

    try {
      expect(migrationBundle.buildMigrationBundle({ cwd })).toMatchObject({
        ok: false,
        errors: ["supabase/migrations is missing."]
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("builds bundles from temporary migration projects", () => {
    const cwd = mkdtempSync(join(tmpdir(), "orbit-migrations-"));
    const migrationsPath = join(cwd, "supabase", "migrations");
    mkdirSync(migrationsPath, { recursive: true });
    writeFileSync(join(migrationsPath, "0001_initial.sql"), "select 1;");
    writeFileSync(join(migrationsPath, "0002_next.sql"), "select 2;");

    try {
      expect(migrationBundle.buildMigrationBundle({ cwd, generatedAt: "2026-07-01T12:00:00.000Z" })).toMatchObject({
        ok: true,
        errors: [],
        migrations: [
          { fileName: "0001_initial.sql", sql: "select 1;" },
          { fileName: "0002_next.sql", sql: "select 2;" }
        ]
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("parses CLI options", () => {
    expect(migrationBundle.parseMigrationBundleCliArgs(["--check"])).toEqual({ check: true, out: null });
    expect(migrationBundle.parseMigrationBundleCliArgs(["--out", "/tmp/orbit.sql"])).toEqual({ check: false, out: "/tmp/orbit.sql" });
    expect(migrationBundle.parseMigrationBundleCliArgs(["--out=/tmp/orbit.sql"])).toEqual({ check: false, out: "/tmp/orbit.sql" });
  });
});
