import { describe, expect, it, vi } from "vitest";
import {
  addYears,
  daysLeft,
  documentAlerts,
  documentBody,
  documentsApi,
  documentsDueSoon,
  emptyDocumentForm,
  fromGregorian,
  fromHijri,
  leftText,
  readParts,
  renewedUntil,
  sortedDocuments,
  stateOf,
  toggleRemind,
  toHijri
} from "@/lib/documents";
import { NOTIFICATION_DEFAULT, notificationAllowed, parseNotificationPrefs } from "@/lib/notification-prefs";
import type { OfficialDocument } from "@/lib/types";

const now = new Date(2026, 10, 15, 10, 0); // 15 Nov 2026, 10:00 local

function paper(overrides: Partial<OfficialDocument> = {}): OfficialDocument {
  return {
    id: "p1",
    user_id: "user-1",
    kind: "passport",
    name: null,
    holder: null,
    expires_on: "2027-03-01",
    remind_days: [30, 7, 0],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("documents", () => {
  it("counts the days left on the phone's own calendar", () => {
    expect(daysLeft(paper({ expires_on: "2026-11-15" }), now)).toBe(0);
    expect(daysLeft(paper({ expires_on: "2026-11-16" }), now)).toBe(1);
    expect(daysLeft(paper({ expires_on: "2026-11-10" }), now)).toBe(-5);
    expect([stateOf(-1), stateOf(0), stateOf(30), stateOf(31)]).toEqual(["expired", "soon", "soon", "ok"]);
    expect(leftText(-5)).toBe("Expired 5 days ago");
    expect(leftText(12)).toBe("12 days left");
    expect(leftText(200)).toBe("6 months left");
  });

  it("lists the soonest first and picks out what is due within a month", () => {
    const list = [paper({ id: "a", expires_on: "2028-01-01" }), paper({ id: "b", kind: "iqama", expires_on: "2026-12-01" }), paper({ id: "c", kind: "national_id", expires_on: "2026-11-01" })];
    expect(sortedDocuments(list).map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(documentsDueSoon(list, now).map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("schedules each heads-up at the chosen time, only those still ahead", () => {
    const alerts = documentAlerts([paper({ expires_on: "2026-11-25", holder: "Sara" })], now, { hour: 8, minute: 30 });
    // 30 days before has passed already.
    expect(alerts.map((alert) => alert.id)).toEqual(["document-p1-7", "document-p1-0"]);
    expect(alerts[0]).toMatchObject({ title: "Passport expires in 7 days", url: "/documents" });
    expect(alerts[0].body).toContain("Sara");
    expect(alerts[0].body).toContain("Renew on Absher");
    expect(alerts[1].title).toBe("Passport expires today");
    expect(alerts[1].at).toEqual(new Date(2026, 10, 25, 8, 30));
    // Health insurance is not renewed on Absher.
    expect(documentAlerts([paper({ kind: "health_insurance", name: "Family plan", expires_on: "2026-12-01" })], now)[0].body).not.toContain("Absher");
  });

  it("renews from the old expiry, or from today once it has passed", () => {
    expect(renewedUntil(paper({ expires_on: "2027-03-01" }), 5, now)).toBe("2032-03-01");
    expect(renewedUntil(paper({ expires_on: "2026-10-01" }), 1, now)).toBe("2027-11-15");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("checks the form before saving", () => {
    const form = emptyDocumentForm("passport");
    expect(form.remindDays).toEqual([180, 30, 0]);
    expect(documentBody(form)).toEqual({ error: "Set the expiry date" });
    expect(documentBody({ ...emptyDocumentForm("other"), expiresOn: "2027-01-01" })).toEqual({ error: "Give it a name" });
    expect(documentBody({ ...form, expiresOn: "2027-01-01", remindDays: [] })).toEqual({ error: "Pick at least one reminder" });
    expect(documentBody({ ...form, expiresOn: "2027-01-01", holder: "  Sara ", remindDays: [0, 180, 30] })).toEqual({
      body: { kind: "passport", name: null, holder: "Sara", expires_on: "2027-01-01", remind_days: [180, 30, 0], notes: null }
    });
    // A fifth heads-up drops the furthest.
    expect(toggleRemind([180, 60, 30, 7], 0)).toEqual([60, 30, 7, 0]);
    expect(toggleRemind([30, 7, 0], 7)).toEqual([30, 0]);
  });

  it("reads typed dates in either digit set and either calendar", () => {
    expect(readParts("١٥", "٣", "٢٠٢٧")).toEqual({ day: 15, month: 3, year: 2027 });
    expect(readParts("x", "3", "2027")).toBeNull();
    expect(fromGregorian({ day: 31, month: 4, year: 2027 })).toBeNull();
    expect(fromGregorian({ day: 29, month: 2, year: 2028 })).toBe("2028-02-29");
    // 15 Nov 2026 is 5 Jumada II 1448 (Umm al-Qura).
    expect(toHijri("2026-11-15")).toEqual({ year: 1448, month: 6, day: 5 });
    expect(fromHijri({ year: 1448, month: 6, day: 5 })).toBe("2026-11-15");
    expect(fromHijri({ year: 1450, month: 1, day: 1 })).toBe("2028-05-25");
    for (const key of ["2027-03-01", "2030-12-31", "2035-06-15"]) expect(fromHijri(toHijri(key)!)).toBe(key);
    expect(fromHijri({ year: 1448, month: 13, day: 1 })).toBeNull();
  });

  it("saves through the backend", async () => {
    const api = { post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    await documentsApi.update(api as never, "p1", { expires_on: "2032-03-01" });
    expect(api.patch).toHaveBeenCalledWith("/documents/p1", { expires_on: "2032-03-01" });
    await documentsApi.remove(api as never, "p1");
    expect(api.delete).toHaveBeenCalledWith("/documents/p1");
  });

  it("has its own switch in Notifications, on by default and quiet with its section", () => {
    expect(NOTIFICATION_DEFAULT.kinds.documents).toBe(true);
    expect(parseNotificationPrefs(JSON.stringify({ kinds: { car: false } })).kinds.documents).toBe(true);
    expect(notificationAllowed(NOTIFICATION_DEFAULT, "documents", (key) => key !== "documents")).toBe(false);
  });
});
