// Which digits numbers are written with, apart from the UI language: Arabic-Indic (٠١٢٣) or Western (0123).
export type Numerals = "arab" | "latn";

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export const isNumerals = (value: unknown): value is Numerals => value === "arab" || value === "latn";

/**
 * Rewrites every digit in `text` with the chosen set, with the separators that go with it:
 * "١٬٢٣٤٫٥ ٪" <-> "1,234.5 %". Letters, colons and other marks are left alone.
 */
export function toNumerals(text: string, numerals: Numerals): string {
  if (numerals === "latn") {
    return text
      .replace(/[٠-٩]/g, (digit) => String(ARABIC.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String(PERSIAN.indexOf(digit)))
      .replace(/(\d)٫(?=\d)/g, "$1.")
      .replace(/(\d)٬(?=\d)/g, "$1,")
      .replace(/٪/g, "%");
  }
  return text
    .replace(/[۰-۹]/g, (digit) => ARABIC[PERSIAN.indexOf(digit)])
    .replace(/(\d)\.(?=\d)/g, "$1٫")
    .replace(/(\d),(?=\d{3})/g, "$1٬")
    .replace(/\d/g, (digit) => ARABIC[Number(digit)]);
}
