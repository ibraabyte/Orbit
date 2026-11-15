import { describe, expect, it, vi } from "vitest";
import { flagLabels, gmailResultMessage, groupFinds, hunterApi, needsLookCount, parsePrice, priceLine, totalsLine, type SubscriptionFind } from "@/lib/subscriptions";

function find(overrides: Partial<SubscriptionFind>): SubscriptionFind {
  return {
    id: "f1", key: "netflix", name: "Netflix", kind: "video", period: "monthly", amount: 45, currency: "SAR", previous_amount: null,
    monthly_cost: 45, first_seen_on: "2026-09-03", last_charged_on: "2026-11-03", next_expected_on: "2026-12-03", charges: 3,
    sources: ["expenses"], flags: ["untracked"], evidence: null, cancel_url: "https://www.netflix.com/cancelplan", cancel_is_search: false,
    status: "new", bill_id: null, ...overrides
  };
}

describe("subscription hunter", () => {
  it("groups finds by what they need, and brings back a cancelled one that still charges", () => {
    const finds = [
      find({ id: "a" }),
      find({ id: "b", status: "kept" }),
      find({ id: "c", status: "tracked" }),
      find({ id: "d", status: "cancelled" }),
      find({ id: "e", status: "cancelled", flags: ["charged_after_cancel"] }),
      find({ id: "f", status: "dismissed" }),
      find({ id: "g", flags: [] })
    ];
    const groups = groupFinds(finds);
    expect(groups.needsLook.map((f) => f.id)).toEqual(["a", "e"]);
    expect(groups.keeping.map((f) => f.id)).toEqual(["b", "c", "g"]);
    expect(groups.setAside.map((f) => f.id)).toEqual(["d", "f"]);
    expect(needsLookCount(finds)).toBe(2);
  });

  it("puts the urgent flags first", () => {
    const labels = flagLabels(find({ flags: ["duplicate", "untracked", "trial_ending", "price_up"] }));
    expect(labels.map((l) => l.flag)).toEqual(["trial_ending", "price_up", "untracked", "duplicate"]);
    expect(labels.filter((l) => l.urgent).map((l) => l.flag)).toEqual(["trial_ending", "price_up"]);
  });

  it("writes prices and totals", () => {
    expect(priceLine(find({}))).toContain("a month");
    expect(priceLine(find({ amount: null }))).toBe("Price unknown");
    expect(totalsLine({ USD: 9.99, SAR: 120, EUR: 0 }).split(" · ")).toHaveLength(2);
    expect(totalsLine({})).toBe("");
  });

  it("reads typed prices in either digits", () => {
    expect(parsePrice("14.99")).toBe(14.99);
    expect(parsePrice("١٤٫٩٩")).toBe(14.99);
    expect(parsePrice("1,200")).toBe(1200);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("0")).toBeNull();
  });

  it("explains how linking Gmail went", () => {
    expect(gmailResultMessage("orbit://subscriptions?status=connected")).toEqual({ ok: true, message: expect.stringContaining("Gmail linked") });
    expect(gmailResultMessage("orbit://subscriptions?status=api_off")?.ok).toBe(false);
    expect(gmailResultMessage("orbit://subscriptions?status=weird")?.message).toContain("failed");
    expect(gmailResultMessage("orbit://subscriptions")).toBeNull();
  });

  it("calls the server's routes", async () => {
    const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    await hunterApi.scan(api);
    await hunterApi.decide(api, "a b", "kept");
    await hunterApi.track(api, "x", 14.99, "USD");
    await hunterApi.track(api, "y");
    await hunterApi.gmailConnectUrl(api, "orbit://subscriptions");
    expect(api.post.mock.calls).toEqual([
      ["/subscriptions/scan"],
      ["/subscriptions/x/track", { amount: 14.99, currency: "USD" }],
      ["/subscriptions/y/track", {}],
      ["/gmail/connect", { return_to: "orbit://subscriptions" }]
    ]);
    expect(api.patch).toHaveBeenCalledWith("/subscriptions/a%20b", { status: "kept" });
  });
});
