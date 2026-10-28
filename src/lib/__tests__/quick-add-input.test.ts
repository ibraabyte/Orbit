import { describe, expect, it } from "vitest";
import { naturalToCommand, parseNatural } from "@/lib/quick-add-input";

const now = new Date(2026, 6, 1, 10, 0); // Wednesday
const opts = { now, defaultCurrency: "SAR" };

describe("natural quick add", () => {
  it("guesses the kind from the first word, no colon needed", () => {
    expect(parseNatural("expense 25 lunch", opts).draft).toMatchObject({ kind: "expense", amount: 25, currency: "SAR", title: "lunch" });
    expect(parseNatural("sleep 7.5h", opts).draft).toMatchObject({ kind: "sleep", sleepMinutes: 450 });
    expect(parseNatural("https://example.com", opts).draft).toMatchObject({ kind: "capture", url: "https://example.com" });
  });

  it("files subscriptions under the subscriptions category", () => {
    expect(parseNatural("اشتراك نتفلكس 45", opts).draft).toMatchObject({ kind: "bill", title: "نتفلكس", amount: 45, currency: "SAR", financeCategory: "subscriptions" });
  });

  it("keeps explicit commands and currencies", () => {
    expect(parseNatural("expense: 4.50 USD coffee", opts).draft).toMatchObject({ kind: "expense", amount: 4.5, currency: "USD" });
  });

  it("falls back to a task when the guess does not fit", () => {
    expect(parseNatural("focus on email replies", opts).draft).toMatchObject({ kind: "task", title: "focus on email replies" });
    expect(parseNatural("call mom", opts).draft).toMatchObject({ kind: "task", title: "call mom" });
  });

  it("reads trailing English dates without @", () => {
    expect(parseNatural("call mom tomorrow 9am", opts).draft).toMatchObject({ title: "call mom", at: new Date(2026, 6, 2, 9, 0).toISOString() });
    expect(parseNatural("pay rent friday", opts).draft).toMatchObject({ title: "pay rent", at: new Date(2026, 6, 3, 12, 0).toISOString() });
    expect(parseNatural("watch today show", opts).draft.at).toBeNull();
  });

  it("does not turn a time into money", () => {
    expect(naturalToCommand("spent lunch tomorrow 9am", opts).command).toBe("expense: lunch @tomorrow 9am");
  });

  it("understands Saudi Arabic", () => {
    expect(parseNatural("صرفت ٢٥ ريال غداء", opts).draft).toMatchObject({ kind: "expense", amount: 25, currency: "SAR", title: "غداء" });
    expect(parseNatural("صرفت 40 بنزين", opts).draft).toMatchObject({ kind: "expense", amount: 40, currency: "SAR" });
    expect(parseNatural("نمت 7 ساعات", opts).draft).toMatchObject({ kind: "sleep", sleepMinutes: 420 });
    expect(parseNatural("وزني 82 كيلو", opts).draft).toMatchObject({ kind: "weight", weight: 82, unit: "kg" });
    expect(parseNatural("تمرين 30 دقيقة", opts).draft).toMatchObject({ kind: "workout", durationMinutes: 30 });
    expect(parseNatural("اشتري حليب", opts).draft).toMatchObject({ kind: "grocery", title: "حليب" });
  });

  it("reads Arabic dates anywhere in the line", () => {
    expect(parseNatural("بكرة اتصل بأمي", opts).draft).toMatchObject({ kind: "task", title: "اتصل بأمي", at: new Date(2026, 6, 2, 12, 0).toISOString() });
    expect(parseNatural("موعد الأسنان الخميس الساعة 4", opts).draft).toMatchObject({ title: "موعد الأسنان", at: new Date(2026, 6, 2, 16, 0).toISOString() });
    expect(parseNatural("اجتماع الاحد الساعة 9 الصبح", opts).draft.at).toBe(new Date(2026, 6, 5, 9, 0).toISOString());
    expect(parseNatural("صرفت 30 غداء", opts).draft.at).toBeNull();
  });
});
