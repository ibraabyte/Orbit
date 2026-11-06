import { describe, expect, it } from "vitest";
import { digits, formatDate, formatNumber, saveNumerals } from "@/lib/i18n";
import { isNumerals, toNumerals } from "@/lib/numerals";

describe("toNumerals", () => {
  it("writes Western digits as Arabic-Indic, with Arabic separators between digits", () => {
    expect(toNumerals("1,234.5", "arab")).toBe("١٬٢٣٤٫٥");
    expect(toNumerals("16:05", "arab")).toBe("١٦:٠٥");
    expect(toNumerals("$12 · 3 min", "arab")).toBe("$١٢ · ٣ min");
  });

  it("writes Arabic-Indic and Persian digits as Western ones", () => {
    expect(toNumerals("١٬٢٣٤٫٥", "latn")).toBe("1,234.5");
    expect(toNumerals("٥٠٪", "latn")).toBe("50%");
    expect(toNumerals("۱۲", "latn")).toBe("12");
    expect(toNumerals("بعد ٤٢ دقيقة", "latn")).toBe("بعد 42 دقيقة");
  });

  it("leaves text without digits, and digits already in the chosen set, alone", () => {
    expect(toNumerals("Today, Fri", "arab")).toBe("Today, Fri");
    expect(toNumerals("12", "latn")).toBe("12");
    expect(toNumerals("١٢", "arab")).toBe("١٢");
    // A comma that isn't a thousands separator stays a comma.
    expect(toNumerals("1, 2", "arab")).toBe("١, ٢");
  });

  it("accepts only the two saved values", () => {
    expect(isNumerals("arab")).toBe(true);
    expect(isNumerals("latn")).toBe(true);
    expect(isNumerals("ar")).toBe(false);
    expect(isNumerals(null)).toBe(false);
  });
});

describe("the numerals setting", () => {
  it("is followed by every formatter, and English keeps Western digits by default", () => {
    expect(formatNumber(1234)).toBe("1,234");
    saveNumerals("arab");
    try {
      expect(formatNumber(1234)).toBe("١٬٢٣٤");
      expect(digits(42)).toBe("٤٢");
      expect(formatDate(new Date(2026, 10, 6), { day: "numeric", month: "short" })).toBe("٦ Nov");
    } finally {
      saveNumerals("latn");
    }
    expect(formatNumber(1234)).toBe("1,234");
  });
});
