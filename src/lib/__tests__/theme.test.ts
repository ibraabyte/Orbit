import { describe, expect, it } from "vitest";
import { colors, day, fonts, night, type Palette } from "@/components/theme";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

// Flatten a color onto what is behind it. Accepts #rrggbb or rgba(r,g,b,a).
function over(top: string, base: Rgb): Rgb {
  const match = top.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  if (!match) return toRgb(top);
  const alpha = Number(match[4]);
  return base.map((channel, i) => Number(match[i + 1]) * alpha + channel * (1 - alpha)) as Rgb;
}

// WCAG contrast ratio between two opaque colors.
function contrast(a: Rgb, b: Rgb) {
  const luminance = (rgb: Rgb) => {
    const [r, g, bl] = rgb.map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("Refined theme", () => {
  it("keeps the black ground and the one sand accent at night, and picks night when the phone says dark", () => {
    expect(night.shell).toBe("#0a0a0b");
    expect(night.accent).toBe("#d6be8c");
    expect(colors).toBe(night);
  });

  it("gives day the same keys as night", () => {
    expect(Object.keys(day).sort()).toEqual(Object.keys(night).sort());
  });

  describe.each<[string, Palette]>([
    ["night", night],
    ["day", day]
  ])("%s", (_mode, p) => {
    // Cards (surface) sit on the ground; inset is the well inside a card.
    const ground = toRgb(p.shell);
    const card = over(p.surface, ground);
    const inset = over(p.surfaceInset, card);
    const hero = over(p.hero, ground);

    it.each<[string, Rgb, Rgb]>([
      ["ink on a card", toRgb(p.ink), card],
      ["muted ink on a card", toRgb(p.inkMuted), card],
      ["faint ink on a card (placeholders)", toRgb(p.inkFaint), card],
      ["ink on an inset well", toRgb(p.ink), inset],
      ["muted ink on an inset well", toRgb(p.inkMuted), inset],
      ["links on a card", toRgb(p.link), card],
      ["links on the ground", toRgb(p.link), ground],
      ["sand numbers on a card", toRgb(p.accentDeep), card],
      ["text on the ground", toRgb(p.onShell), ground],
      ["muted text on the ground", toRgb(p.onShellMuted), ground],
      ["errors on a card", toRgb(p.dangerOnShell), card],
      ["black text on the sand button", toRgb(p.accentInk), toRgb(p.accent)],
      ["text on the urgent pill", toRgb(p.urgentInk), toRgb(p.urgent)],
      ["hero text", toRgb(p.heroInk), hero],
      ["secondary hero text", toRgb(p.accentMuted), hero],
      ["tinted badge", toRgb(p.accentTintInk), over(p.accentTint, card)],
      ["success badge", toRgb(p.success), over(p.successTint, card)],
      ["text on the solid glass stand-in", toRgb(p.ink), toRgb(p.glassSolid)],
      ["faint ink on an inset well (placeholders in fields)", toRgb(p.inkFaint), inset],
      ["text on the ink-coloured button", toRgb(p.urgentInk), toRgb(p.ink)]
    ])("%s is readable (AA, 4.5:1)", (_name, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    // Rings, bars and switches are shapes, not text: WCAG asks 3:1 against what they sit on.
    it("sand rings and bars show on a card (3:1)", () => {
      expect(contrast(toRgb(p.accent), card)).toBeGreaterThanOrEqual(3);
    });
  });

  it("names one JetBrains Mono family per weight (English; Arabic uses IBM Plex Sans Arabic)", () => {
    expect(Object.values(fonts)).toEqual(["JetBrainsMono_400Regular", "JetBrainsMono_500Medium", "JetBrainsMono_600SemiBold", "JetBrainsMono_700Bold"]);
  });
});
