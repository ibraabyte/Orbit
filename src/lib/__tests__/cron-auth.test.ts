import { describe, expect, it } from "vitest";
import { MIN_PRODUCTION_CRON_SECRET_LENGTH, cronAuthorizationStatus, isUnsafeCronSecret } from "@/lib/cron-auth";

const strongSecret = "a".repeat(MIN_PRODUCTION_CRON_SECRET_LENGTH);

describe("cron authorization", () => {
  it("allows local manual reminder sends without a cron secret", () => {
    expect(cronAuthorizationStatus({ authorization: null, cronSecret: undefined, nodeEnv: "development" })).toBe("authorized");
  });

  it("fails closed in production when the cron secret is missing", () => {
    expect(cronAuthorizationStatus({ authorization: null, cronSecret: undefined, nodeEnv: "production" })).toBe("missing-secret");
  });

  it("requires the bearer token when a cron secret is configured", () => {
    expect(cronAuthorizationStatus({ authorization: `Bearer ${strongSecret}`, cronSecret: strongSecret, nodeEnv: "production" })).toBe("authorized");
    expect(cronAuthorizationStatus({ authorization: null, cronSecret: strongSecret, nodeEnv: "production" })).toBe("unauthorized");
    expect(cronAuthorizationStatus({ authorization: "Bearer wrong-value", cronSecret: "secret-value", nodeEnv: "development" })).toBe("unauthorized");
  });

  it("accepts bearer tokens with harmless casing and whitespace differences", () => {
    expect(cronAuthorizationStatus({ authorization: `  bearer ${strongSecret}  `, cronSecret: ` ${strongSecret} `, nodeEnv: "production" })).toBe("authorized");
  });

  it("rejects weak or placeholder cron secrets in production", () => {
    expect(cronAuthorizationStatus({ authorization: "Bearer cron-secret", cronSecret: "cron-secret", nodeEnv: "production" })).toBe("unsafe-secret");
    expect(cronAuthorizationStatus({ authorization: "Bearer short-secret", cronSecret: "short-secret", nodeEnv: "production" })).toBe("unsafe-secret");
  });

  it("classifies unsafe cron secrets", () => {
    expect(isUnsafeCronSecret("replace-me")).toBe(true);
    expect(isUnsafeCronSecret("replace-with-at-least-32-random-characters")).toBe(true);
    expect(isUnsafeCronSecret("x".repeat(MIN_PRODUCTION_CRON_SECRET_LENGTH - 1))).toBe(true);
    expect(isUnsafeCronSecret(strongSecret)).toBe(false);
  });
});
