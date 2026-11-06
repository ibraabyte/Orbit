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

  it("reads a list and a checklist on a task, and still finds the date", () => {
    expect(parseNatural("pack bag +travel tomorrow 9am; passport; charger", opts).draft).toMatchObject({
      kind: "task",
      title: "pack bag",
      listName: "travel",
      steps: ["passport", "charger"],
      at: new Date(2026, 6, 2, 9, 0).toISOString()
    });
    expect(parseNatural("مهمة رتب الدولاب +البيت؛ الملابس؛ الأحذية", opts).draft).toMatchObject({
      kind: "task",
      title: "رتب الدولاب",
      listName: "البيت",
      steps: ["الملابس", "الأحذية"]
    });
    // A phone number is not a list.
    expect(parseNatural("call +966500000000", opts).draft).toMatchObject({ title: "call +966500000000", listName: null, steps: [] });
  });

  it("reads a trailing date that comes before !priority and #tags", () => {
    expect(parseNatural("pay rent fri 5pm !high", opts).draft).toMatchObject({ title: "pay rent", priority: "high", at: new Date(2026, 6, 3, 17, 0).toISOString() });
    expect(parseNatural("call mom tomorrow 9am #family !low", opts).draft).toMatchObject({ title: "call mom", priority: "low", tags: ["family"], at: new Date(2026, 6, 2, 9, 0).toISOString() });
    expect(parseNatural("fix sink !high", opts).draft).toMatchObject({ title: "fix sink", priority: "high", at: null });
  });

  it("plans a meal when plan is followed by a meal word, otherwise keeps a task", () => {
    expect(parseNatural("plan dinner salmon @friday", opts).draft).toMatchObject({ kind: "mealPlan", title: "salmon", mealType: "dinner", at: new Date(2026, 6, 3, 12, 0).toISOString() });
    expect(parseNatural("plan lunch shawarma tomorrow", opts).draft).toMatchObject({ kind: "mealPlan", title: "shawarma", mealType: "lunch" });
    expect(parseNatural("plan the trip @friday", opts).draft).toMatchObject({ kind: "task", title: "plan the trip" });
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

describe("quick expenses", () => {
  const opts = { defaultCurrency: "SAR", now: new Date("2026-11-04T12:00:00+03:00") };

  it("saves a spending word and an amount as an expense with a guessed category", () => {
    expect(parseNatural("غداء 45", opts).draft).toMatchObject({ kind: "expense", amount: 45, currency: "SAR", title: "غداء", financeCategory: "food" });
    expect(parseNatural("بنزين ١٢٠", opts).draft).toMatchObject({ kind: "expense", amount: 120, financeCategory: "transport" });
    expect(parseNatural("50 البنزين", opts).draft).toMatchObject({ kind: "expense", amount: 50, financeCategory: "transport" });
    expect(parseNatural("قهوة 18 ريال", opts).draft).toMatchObject({ kind: "expense", amount: 18, currency: "SAR", financeCategory: "food" });
    expect(parseNatural("coffee 4.5 USD", opts).draft).toMatchObject({ kind: "expense", amount: 4.5, currency: "USD", financeCategory: "food" });
    expect(parseNatural("صيدلية 32", opts).draft).toMatchObject({ kind: "expense", financeCategory: "health" });
  });

  it("guesses the category when the expense word is said too", () => {
    expect(parseNatural("صرفت 40 بنزين", opts).draft).toMatchObject({ kind: "expense", financeCategory: "transport" });
    expect(parseNatural("spent 25 lunch", opts).draft).toMatchObject({ kind: "expense", financeCategory: "food" });
    // A category tag still wins.
    expect(parseNatural("spent 25 lunch #travel", opts).draft).toMatchObject({ financeCategory: "travel" });
  });

  it("leaves other lines alone", () => {
    expect(parseNatural("غداء مع خالد بكرة الساعة 1", opts).draft.kind).not.toBe("expense");
    expect(parseNatural("call mom 3", opts).draft.kind).toBe("task");
    expect(parseNatural("غداء", opts).draft.kind).toBe("task");
    expect(parseNatural("اشتراك نتفلكس 45", opts).draft).toMatchObject({ kind: "bill", financeCategory: "subscriptions" });
  });
});
