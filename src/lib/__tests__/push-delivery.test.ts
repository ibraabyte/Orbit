import { describe, expect, it } from "vitest";
import { isExpiredPushSubscriptionError, pushDeliveryErrorStatus } from "@/lib/push-delivery";

describe("push delivery errors", () => {
  it("detects expired or gone push subscriptions", () => {
    expect(isExpiredPushSubscriptionError({ statusCode: 404 })).toBe(true);
    expect(isExpiredPushSubscriptionError({ statusCode: 410 })).toBe(true);
    expect(isExpiredPushSubscriptionError({ status: 410 })).toBe(true);
  });

  it("keeps transient push failures subscribed", () => {
    expect(isExpiredPushSubscriptionError({ statusCode: 429 })).toBe(false);
    expect(isExpiredPushSubscriptionError({ statusCode: 500 })).toBe(false);
    expect(isExpiredPushSubscriptionError(new Error("network failed"))).toBe(false);
    expect(isExpiredPushSubscriptionError(null)).toBe(false);
  });

  it("extracts numeric status from web push errors", () => {
    expect(pushDeliveryErrorStatus({ statusCode: 410 })).toBe(410);
    expect(pushDeliveryErrorStatus({ status: 404 })).toBe(404);
    expect(pushDeliveryErrorStatus({ statusCode: "410" })).toBeNull();
  });
});
