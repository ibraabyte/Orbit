#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMigrationBundle } from "./migration-bundle.mjs";

export const requiredEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "CRON_SECRET"
];

const minCronSecretLength = 32;
const requiredCron = { path: "/api/reminders/send", schedule: "*/5 * * * *" };
const smokeOriginEnvKey = "ORBIT_SMOKE_ORIGIN";

export function parseDotEnv(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquoteEnvValue(match[2].trim());
  }

  return values;
}

export function buildDeploymentPreflightReport({
  cwd = process.cwd(),
  env = process.env,
  envFile = ".env.local",
  allowLocalSupabase = false,
  smokeOrigin
} = {}) {
  const errors = [];
  const warnings = [];
  const fileEnv = loadEnvFile(cwd, envFile, warnings);
  const mergedEnv = { ...env, ...fileEnv };
  const smokeOriginReport = validateSmokeOrigin(smokeOrigin ?? mergedEnv[smokeOriginEnvKey]);
  const migrationReport = validateMigrationBundle(cwd);

  errors.push(...validateProductionEnv(mergedEnv, { allowLocalSupabase }));
  errors.push(...validateVercelCron(cwd));
  errors.push(...smokeOriginReport.errors);
  errors.push(...migrationReport.errors);
  warnings.push(...smokeOriginReport.warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedEnvFile: envFile || null,
    smokeOrigin: smokeOriginReport.origin,
    smokeCommand: smokeOriginReport.origin ? `npm run smoke -- --origin ${smokeOriginReport.origin}` : null,
    migrationCount: migrationReport.count,
    migrationSourceChecksum: migrationReport.sourceChecksum
  };
}

export function validateProductionEnv(env, { allowLocalSupabase = false } = {}) {
  const errors = [];

  for (const key of requiredEnvKeys) {
    const value = envValue(env, key);
    if (!value) {
      errors.push(`${key} is missing.`);
    } else if (looksPlaceholder(value)) {
      errors.push(`${key} still looks like a placeholder.`);
    }
  }

  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const parsedSupabaseUrl = parseUrl(supabaseUrl);
  if (supabaseUrl && !parsedSupabaseUrl) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  } else if (parsedSupabaseUrl) {
    const local = isLocalHost(parsedSupabaseUrl.hostname);
    if (parsedSupabaseUrl.protocol !== "https:" && !(allowLocalSupabase && local)) {
      errors.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS for production.");
    }
    if (local && !allowLocalSupabase) {
      errors.push("NEXT_PUBLIC_SUPABASE_URL points at a local Supabase instance.");
    }
  }

  for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = envValue(env, key);
    if (value && value.length < 40) {
      errors.push(`${key} is too short to be a production Supabase key.`);
    }
  }

  for (const key of ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
    const value = envValue(env, key);
    if (value && !isBase64Urlish(value)) {
      errors.push(`${key} must be URL-safe base64.`);
    } else if (value && value.length < 32) {
      errors.push(`${key} is too short to be a production VAPID key.`);
    }
  }

  const vapidSubject = envValue(env, "VAPID_SUBJECT");
  if (vapidSubject && !isValidVapidSubject(vapidSubject)) {
    errors.push("VAPID_SUBJECT must be a mailto: address or HTTPS URL.");
  }

  const cronSecret = envValue(env, "CRON_SECRET");
  if (cronSecret && cronSecret.length < minCronSecretLength) {
    errors.push(`CRON_SECRET must be at least ${minCronSecretLength} characters.`);
  }

  return unique(errors);
}

export function validateVercelCron(cwd = process.cwd()) {
  const path = resolve(cwd, "vercel.json");
  if (!existsSync(path)) return ["vercel.json is missing."];

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    const crons = Array.isArray(parsed.crons) ? parsed.crons : [];
    const hasReminderCron = crons.some((cron) => cron?.path === requiredCron.path && cron?.schedule === requiredCron.schedule);
    return hasReminderCron ? [] : [`vercel.json must schedule ${requiredCron.path} as ${requiredCron.schedule}.`];
  } catch {
    return ["vercel.json must be valid JSON."];
  }
}

export function validateSmokeOrigin(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return {
      origin: null,
      errors: [],
      warnings: [`${smokeOriginEnvKey} is not set; pass --origin to npm run smoke after deploy.`]
    };
  }

  if (looksPlaceholder(rawValue)) {
    return {
      origin: null,
      errors: [`${smokeOriginEnvKey} still looks like a placeholder.`],
      warnings: []
    };
  }

  const parsed = parseUrl(rawValue);
  if (!parsed) {
    return {
      origin: null,
      errors: [`${smokeOriginEnvKey} must be a valid URL.`],
      warnings: []
    };
  }

  const origin = parsed.origin;
  const local = isLocalHost(parsed.hostname);
  const errors = [];
  if (parsed.protocol !== "https:") {
    errors.push(`${smokeOriginEnvKey} must use HTTPS for production smoke checks.`);
  }
  if (local) {
    errors.push(`${smokeOriginEnvKey} points at a local development server.`);
  }

  return {
    origin: errors.length ? null : origin,
    errors,
    warnings: parsed.href !== `${origin}/` ? [`${smokeOriginEnvKey} will be normalized to ${origin}.`] : []
  };
}

export function validateMigrationBundle(cwd = process.cwd()) {
  const report = buildMigrationBundle({ cwd });

  if (!report.ok) {
    return {
      count: 0,
      sourceChecksum: null,
      errors: report.errors.map((error) => `Supabase migrations: ${error}`)
    };
  }

  return {
    count: report.migrations.length,
    sourceChecksum: report.sourceChecksum,
    errors: []
  };
}

function loadEnvFile(cwd, envFile, warnings) {
  if (!envFile) return {};

  const path = resolve(cwd, envFile);
  if (!existsSync(path)) {
    warnings.push(`${envFile} was not found; checking process environment only.`);
    return {};
  }

  return parseDotEnv(readFileSync(path, "utf8"));
}

function unquoteEnvValue(value) {
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

function envValue(env, key) {
  return String(env[key] ?? "").trim();
}

function looksPlaceholder(value) {
  const normalized = value.toLowerCase();
  const exactPlaceholders = [
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
  ];

  return exactPlaceholders.includes(normalized) ||
    normalized.includes("example.com") ||
    normalized.includes("your-production-domain") ||
    normalized.includes("your-project-ref") ||
    normalized.includes("change-me") ||
    normalized.includes("replace-me") ||
    normalized.includes(".example") ||
    normalized.startsWith("replace-with-");
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}

function isBase64Urlish(value) {
  return /^[A-Za-z0-9_-]+={0,2}$/.test(value);
}

function isValidVapidSubject(value) {
  if (value.startsWith("mailto:")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.slice("mailto:".length));
  const parsedUrl = parseUrl(value);
  return parsedUrl?.protocol === "https:";
}

function unique(values) {
  return [...new Set(values)];
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--no-env-file") {
      options.envFile = null;
    } else if (arg === "--allow-local-supabase") {
      options.allowLocalSupabase = true;
    } else if (arg === "--smoke-origin") {
      options.smokeOrigin = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--smoke-origin=")) {
      options.smokeOrigin = arg.slice("--smoke-origin=".length);
    } else if (arg === "--env-file") {
      options.envFile = argv[index + 1] ?? "";
      index += 1;
    } else if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
    }
  }

  return options;
}

function printReport(report) {
  if (report.ok) {
    console.log("Orbit deployment preflight passed.");
    if (report.migrationSourceChecksum) {
      console.log(`Supabase migrations: ${report.migrationCount} files, source ${report.migrationSourceChecksum}.`);
    }
    if (report.smokeCommand) {
      console.log(`Next smoke check: ${report.smokeCommand}`);
    }
  } else {
    console.error("Orbit deployment preflight failed:");
    for (const error of report.errors) {
      console.error(`- ${error}`);
    }
  }

  for (const warning of report.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const report = buildDeploymentPreflightReport(parseCliArgs(process.argv.slice(2)));
  printReport(report);
  process.exitCode = report.ok ? 0 : 1;
}
