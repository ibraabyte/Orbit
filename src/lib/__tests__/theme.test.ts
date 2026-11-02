import { describe, expect, it } from "vitest";
import { colors, fonts } from "@/components/theme";

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

// The worst case for pale text: the top of the screen, where the lime glow of the backdrop is strongest.
const glow = over("rgba(155,220,51,0.13)", toRgb(colors.shellTop));
const card = over(colors.surface, glow);
const inset = over(colors.surfaceInset, card);
const hero = over(colors.hero, glow);

describe("Dark glass theme", () => {
  it("keeps the dark chrome and the lime accent", () => {
    expect(colors.shell).toBe("#0c120e");
    expect(colors.accent).toBe("#9bdc33");
  });

  it.each<[string, Rgb, Rgb]>([
    ["ink on a card", toRgb(colors.ink), card],
    ["muted ink on a card", toRgb(colors.inkMuted), card],
    ["faint ink on a card (placeholders)", toRgb(colors.inkFaint), card],
    ["ink on an inset well", toRgb(colors.ink), inset],
    ["muted ink on an inset well", toRgb(colors.inkMuted), inset],
    ["links on a card", toRgb(colors.link), card],
    ["lime numbers on a card", toRgb(colors.accentDeep), card],
    ["text on the backdrop", toRgb(colors.onShell), glow],
    ["muted text on the backdrop", toRgb(colors.onShellMuted), glow],
    ["errors on a card", toRgb(colors.dangerOnShell), card],
    ["dark text on a lime button", toRgb(colors.accentInk), toRgb(colors.accent)],
    ["dark text on the pale urgent pill", toRgb(colors.urgentInk), toRgb(colors.urgent)],
    ["hero text", toRgb(colors.heroInk), hero],
    ["secondary hero text", toRgb(colors.accentMuted), hero],
    ["tinted badge", toRgb(colors.accentTintInk), over(colors.accentTint, card)],
    ["success badge", toRgb(colors.success), over(colors.successTint, card)],
    ["text on the solid glass stand-in", toRgb(colors.ink), toRgb(colors.glassSolid)]
  ])("%s is readable (AA, 4.5:1)", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("names one Space Grotesk family per weight", () => {
    expect(Object.values(fonts)).toEqual(["SpaceGrotesk_400Regular", "SpaceGrotesk_500Medium", "SpaceGrotesk_600SemiBold", "SpaceGrotesk_700Bold"]);
  });
});
