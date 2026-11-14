import { describe, expect, it, vi } from "vitest";
import { callBadge, callsApi, isActive, normalizePhone, phoneValid, setupReady } from "@/lib/phone-calls";

// Made-up numbers and accounts only.
describe("phone numbers", () => {
  it("turns a Saudi mobile into +966", () => {
    expect(normalizePhone("050 000 0002")).toBe("+966500000002");
    expect(normalizePhone("٠٥٠٠٠٠٠٠٠٢")).toBe("+966500000002");
    expect(normalizePhone("00966500000002")).toBe("+966500000002");
    expect(normalizePhone("+1 (555) 010-0000")).toBe("+15550100000");
  });

  it("refuses short and emergency numbers", () => {
    expect(phoneValid("997")).toBe(false);
    expect(phoneValid("112")).toBe(false);
    expect(phoneValid("0500000002")).toBe(true);
  });
});

describe("setup form", () => {
  const sid = `AC${"0".repeat(31)}1`;
  it("needs a token the first time, not when one is saved", () => {
    const form = { accountSid: sid, authToken: "", fromNumber: "0500000001", voice: "marin" };
    expect(setupReady(form, null)).toBe(false);
    expect(setupReady({ ...form, authToken: "made-up" }, null)).toBe(true);
    expect(setupReady(form, { connected: true, account_hint: "0001", from_number: "+966500000001", voice: "marin", openai: true, ready: true, voices: [] })).toBe(true);
    expect(setupReady({ ...form, accountSid: "AC12", authToken: "x" }, null)).toBe(false);
  });

  it("sends the token only when typed", async () => {
    const put = vi.fn().mockResolvedValue({});
    await callsApi.saveSetup({ put } as never, { accountSid: ` ${sid} `, authToken: " ", fromNumber: "0500000001", voice: "cedar" });
    expect(put).toHaveBeenCalledWith("/calls/setup", { account_sid: sid, from_number: "0500000001", voice: "cedar" });
  });
});

describe("call badges", () => {
  it("shows where the call is, then how it went", () => {
    expect(callBadge({ status: "draft", outcome: null }).tone).toBe("neutral");
    expect(callBadge({ status: "in_progress", outcome: null }).tone).toBe("accent");
    expect(callBadge({ status: "ended", outcome: "booked" }).tone).toBe("success");
    expect(callBadge({ status: "ended", outcome: "needs_you" }).tone).toBe("accent");
    expect(callBadge({ status: "failed", outcome: null }).tone).toBe("urgent");
    expect(isActive({ status: "calling" })).toBe(true);
    expect(isActive({ status: "ended" })).toBe(false);
  });
});
