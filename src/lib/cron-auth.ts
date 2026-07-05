import { timingSafeEqual } from "node:crypto";

export type CronAuthorizationStatus = "authorized" | "missing-secret" | "unsafe-secret" | "unauthorized";

export const MIN_PRODUCTION_CRON_SECRET_LENGTH = 32;

const placeholderCronSecrets = new Set([
  "secret",
  "cron-secret",
  "cron_secret",
  "change-me",
  "changeme",
  "replace-me",
  "password",
  "your-secret",
  "your-cron-secret",
  "replace-with-long-random-secret",
  "replace-with-at-least-32-random-characters"
]);

export function cronAuthorizationStatus({
  authorization,
  cronSecret,
  nodeEnv
}: {
  authorization: string | null;
  cronSecret: string | undefined;
  nodeEnv: string | undefined;
}): CronAuthorizationStatus {
  const secret = normalizeCronSecret(cronSecret);
  if (!secret) return nodeEnv === "production" ? "missing-secret" : "authorized";
  if (nodeEnv === "production" && isUnsafeCronSecret(secret)) return "unsafe-secret";

  const token = bearerToken(authorization);
  return token && timingSafeStringEqual(token, secret) ? "authorized" : "unauthorized";
}

export function isUnsafeCronSecret(secret: string) {
  const normalized = secret.trim().toLowerCase();
  return normalized.length < MIN_PRODUCTION_CRON_SECRET_LENGTH || placeholderCronSecrets.has(normalized);
}

function normalizeCronSecret(value: string | undefined) {
  const secret = value?.trim();
  return secret || null;
}

function bearerToken(value: string | null) {
  const match = value?.match(/^\s*Bearer\s+(.+?)\s*$/i);
  return match?.[1] ?? null;
}

function timingSafeStringEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}
