#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsRelativePath = join("supabase", "migrations");
const migrationFilePattern = /^(\d{4})_[a-z0-9_]+\.sql$/;

export function readMigrationFiles(cwd = process.cwd()) {
  const migrationsPath = resolve(cwd, migrationsRelativePath);
  if (!existsSync(migrationsPath)) {
    return {
      migrations: [],
      errors: [`${migrationsRelativePath} is missing.`]
    };
  }

  const fileNames = readdirSync(migrationsPath)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  const errors = validateMigrationFileNames(fileNames);
  const migrations = fileNames.map((fileName) => ({
    fileName,
    sql: readFileSync(join(migrationsPath, fileName), "utf8").trimEnd()
  }));

  return { migrations, errors };
}

export function validateMigrationFileNames(fileNames) {
  const errors = [];
  if (!fileNames.length) {
    return ["No SQL migration files were found."];
  }

  const seenPrefixes = new Set();
  const numberedFiles = [];

  for (const fileName of fileNames) {
    const match = fileName.match(migrationFilePattern);
    if (!match) {
      errors.push(`${fileName} must use a four-digit numeric prefix, for example 0001_initial_schema.sql.`);
      continue;
    }

    const prefix = match[1];
    if (seenPrefixes.has(prefix)) {
      errors.push(`Migration prefix ${prefix} is duplicated.`);
    }
    seenPrefixes.add(prefix);
    numberedFiles.push({ fileName, number: Number(prefix) });
  }

  numberedFiles.sort((left, right) => left.number - right.number);
  numberedFiles.forEach((file, index) => {
    const expected = index + 1;
    if (file.number !== expected) {
      errors.push(`${file.fileName} should use prefix ${String(expected).padStart(4, "0")} to keep migrations contiguous.`);
    }
  });

  return unique(errors);
}

export function buildMigrationBundle({ cwd = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  const { migrations, errors } = readMigrationFiles(cwd);
  if (errors.length) {
    return {
      ok: false,
      errors,
      migrations,
      sql: null,
      sourceChecksum: null,
      bundleChecksum: null,
      bytes: 0
    };
  }

  const body = migrations.map(formatMigrationBlock).join("\n\n");
  const sourceChecksum = sha256(body);
  const header = [
    "-- Orbit Supabase migration bundle",
    `-- Generated: ${generatedAt}`,
    `-- Source directory: ${migrationsRelativePath}`,
    `-- Migration files: ${migrations.length}`,
    `-- Source SHA256: ${sourceChecksum}`,
    "-- Intended for a fresh Supabase project. For an already-migrated project, apply only the missing numbered files in order."
  ].join("\n");
  const sql = `${header}\n\nbegin;\n\n${body}\n\ncommit;\n`;

  return {
    ok: true,
    errors: [],
    migrations,
    sql,
    sourceChecksum,
    bundleChecksum: sha256(sql),
    bytes: Buffer.byteLength(sql, "utf8")
  };
}

export function parseMigrationBundleCliArgs(argv) {
  const options = { check: false, out: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--out") {
      options.out = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    }
  }

  return options;
}

function formatMigrationBlock(migration) {
  return [
    "-- -----------------------------------------------------------------------------",
    `-- ${migration.fileName}`,
    "-- -----------------------------------------------------------------------------",
    migration.sql
  ].join("\n");
}

function writeBundle(path, sql) {
  const outputPath = resolve(path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, sql);
  return outputPath;
}

function printReport(report, options) {
  if (!report.ok) {
    console.error("Orbit migration bundle failed:");
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
    return;
  }

  if (options.check) {
    console.log(`Orbit migrations are contiguous: ${report.migrations.length} files, source ${report.sourceChecksum}.`);
    return;
  }

  if (options.out) {
    const outputPath = writeBundle(options.out, report.sql);
    console.log(`Wrote ${report.migrations.length} migrations to ${outputPath}.`);
    console.log(`Bundle SHA256: ${report.bundleChecksum}`);
    return;
  }

  process.stdout.write(report.sql);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseMigrationBundleCliArgs(process.argv.slice(2));
  const report = buildMigrationBundle();
  printReport(report, options);
  process.exitCode = report.ok ? 0 : 1;
}
