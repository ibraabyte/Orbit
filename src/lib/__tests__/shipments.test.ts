import { describe, expect, it, vi } from "vitest";
import { alertContent, cleanNumber, daysUntil, detailText, etaText, flagLabels, groupShipments, looksLikeNumber, needsLookCount, rowLine, rowMeta, shipmentsApi, shipmentTitle, type Shipment } from "@/lib/shipments";

// Made-up shipments only.
function shipment(overrides: Partial<Shipment>): Shipment {
  return {
    id: "s1", number: "RR123456789SA", label: null, store: "Noon", source: "email", carrier_name: "Saudi Post", status: "in_transit",
    sub_status: null, last_event: "Left the facility", last_location: "Riyadh", last_event_at: "2026-11-14T10:30:00Z", eta_on: "2026-11-18",
    delivered_at: null, events: [], registered: true, checked_at: "2026-11-15T08:00:00Z", error: null, archived: false, flags: [], alert: null,
    created_at: "2026-11-12T08:00:00Z", ...overrides
  };
}

const NOW = new Date(2026, 10, 15, 9, 0);

describe("order tracker", () => {
  it("cleans and checks typed numbers", () => {
    expect(cleanNumber(" rr-1234 56789sa ")).toBe("RR123456789SA");
    expect(cleanNumber("٥٥٤٤٣٣٢٢١١٠")).toBe("55443322110");
    expect(looksLikeNumber("RR123456789SA")).toBe(true);
    expect(looksLikeNumber("abc")).toBe(false);
    expect(looksLikeNumber("not a number!")).toBe(false);
  });

  it("groups what needs a look, what is coming and what arrived", () => {
    const list = [
      shipment({ id: "a", flags: ["late"] }),
      shipment({ id: "b" }),
      shipment({ id: "c", status: "delivered" }),
      shipment({ id: "d", status: "pending", flags: ["no_info"] }),
      shipment({ id: "e", status: "exception", flags: ["problem"] })
    ];
    const groups = groupShipments(list);
    expect(groups.needsLook.map((s) => s.id)).toEqual(["a", "d", "e"]);
    expect(groups.coming.map((s) => s.id)).toEqual(["b"]);
    expect(groups.arrived.map((s) => s.id)).toEqual(["c"]);
    // "No info yet" is worth seeing on the screen but not a number on More.
    expect(needsLookCount(list)).toBe(2);
  });

  it("puts problems first and marks them urgent", () => {
    expect(flagLabels(shipment({ flags: ["no_info", "late", "problem"] })).map((f) => [f.flag, f.urgent])).toEqual([
      ["problem", true],
      ["late", true],
      ["no_info", false]
    ]);
  });

  it("says when it should arrive", () => {
    expect(daysUntil("2026-11-18", NOW)).toBe(3);
    expect(etaText(shipment({}), NOW)).toContain("Expected");
    expect(etaText(shipment({ eta_on: "2026-11-15" }), NOW)).toBe("Arriving today");
    expect(etaText(shipment({ eta_on: "2026-11-16" }), NOW)).toBe("Arriving tomorrow");
    expect(etaText(shipment({ eta_on: "2026-11-10" }), NOW)).toContain("Was expected");
    expect(etaText(shipment({ eta_on: null }), NOW)).toBeNull();
    expect(etaText(shipment({ status: "delivered", delivered_at: "2026-11-14T11:00:00Z" }), NOW)).toContain("Arrived");
  });

  it("writes the row and the sheet", () => {
    expect(shipmentTitle(shipment({}))).toBe("Noon");
    expect(shipmentTitle(shipment({ label: "Headphones" }))).toBe("Headphones");
    expect(shipmentTitle(shipment({ store: null }))).toBe("RR123456789SA");
    expect(rowLine(shipment({}), NOW)).toMatch(/^Left the facility · Expected/);
    expect(rowLine(shipment({ status: "pending", last_event: null, error: "The carrier cannot be detected." }), NOW)).toMatch(/^The carrier cannot be detected\./);
    expect(rowMeta(shipment({ label: "Headphones" }))).toBe("Saudi Post · Noon");
    const detail = detailText(shipment({ events: Array.from({ length: 8 }, (_, i) => ({ at: null, text: `Step ${i}`, place: i ? null : "Riyadh" })) }), NOW, 3);
    expect(detail.split("\n")).toEqual([expect.stringContaining("RR123456789SA · Saudi Post · On the way"), "• Step 0 · Riyadh", "• Step 1", "• Step 2", "…and 5 earlier updates"]);
  });

  it("turns an alert into a notification", () => {
    expect(alertContent(shipment({}))).toBeNull();
    expect(alertContent(shipment({ alert: "delivered", label: "Books", last_event: "Delivered" }))).toEqual({ title: "Your shipment arrived", body: "Books · Delivered" });
  });

  it("talks to the server", async () => {
    const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    await shipmentsApi.add(api, "RR123456789SA", "  ");
    expect(api.post).toHaveBeenCalledWith("/shipments", { number: "RR123456789SA", label: null });
    await shipmentsApi.hide(api, "s 1");
    expect(api.patch).toHaveBeenCalledWith("/shipments/s%201", { archived: true });
    await shipmentsApi.connect(api, " key-1234 ");
    expect(api.put).toHaveBeenCalledWith("/shipments/tracking", { api_key: "key-1234" });
    await shipmentsApi.seen(api, ["a", "b"]);
    expect(api.post).toHaveBeenCalledWith("/shipments/seen", { ids: ["a", "b"] });
  });
});
