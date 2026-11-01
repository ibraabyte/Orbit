import { describe, expect, it } from "vitest";
import { colors, fonts } from "@/components/theme";

// WCAG contrast ratio between two #rrggbb colors.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("Drift theme", () => {
  it("keeps the fixed dark chrome and cream cards", () => {
    expect(contrast(colors.shell, colors.surface)).toBeGreaterThan(10);
    expect(colors.shell).toBe("#101511");
    expect(colors.accent).toBe("#9bdc33");
  });

  it.each([
    ["ink on cream", colors.ink, colors.surface],
    ["muted ink on cream", colors.inkMuted, colors.surface],
    ["ink on inset cream", colors.ink, colors.surfaceInset],
    ["muted ink on inset cream (placeholders, segments)", colors.inkMuted, colors.surfaceInset],
    ["text on the dark background", colors.onShell, colors.shell],
    ["muted text on the dark background", colors.onShellMuted, colors.shell],
    ["lime text on the dark background", colors.accent, colors.shell],
    ["errors on the dark background", colors.dangerOnShell, colors.shell],
    ["dark text on a lime button", colors.accentInk, colors.accent],
    ["cream text on the dark urgent pill", colors.urgentInk, colors.urgent],
    ["links on cream", colors.link, colors.surface],
    ["secondary text on lime", colors.accentMuted, colors.accent],
    ["tinted badge", colors.accentTintInk, colors.accentTint]
  ])("%s is readable (AA, 4.5:1)", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("names one Space Grotesk family per weight", () => {
    expect(Object.values(fonts)).toEqual(["SpaceGrotesk_400Regular", "SpaceGrotesk_500Medium", "SpaceGrotesk_600SemiBold", "SpaceGrotesk_700Bold"]);
  });
});
