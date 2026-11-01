// Drift: the web version's look (DESIGN.md, tag web-final), ported to the app.
// Dark forest chrome, warm cream cards, one lime accent. Fixed, not a light/dark toggle.
// Hex values are the web's OKLCH tokens converted to sRGB.
export const colors = {
  // Chrome (the dark background, headers and tab bar) and text on it.
  shell: "#101511", // forest-5
  shellTop: "#18201b",
  onShell: "#edf0e7",
  onShellMuted: "#8a968c",
  navInactive: "#737d75",
  // Cards and text on them.
  surface: "#eaefdf", // cream-2
  surfaceInset: "#d8e3c9", // cream-4
  hairline: "#cddaba", // cream-5
  ink: "#16231a",
  inkMuted: "#4b5d51",
  // Lime accent: always with dark accent-ink text, never white.
  accent: "#9bdc33", // sprout-5
  accentInk: "#132419",
  accentDeep: "#5a9313", // lime that reads on cream (charts, highlights)
  // Status.
  urgent: "#223227",
  success: "#2a904b",
  warning: "#bf851e",
  danger: "#cf4238",
  dangerOnShell: "#f0776a", // danger that stays readable on the dark chrome
  barMuted: "#6b9174",
  // Badge tints and the ring/progress track.
  urgentInk: "#eaefdf",
  successTint: "#c1c6c1", // emerald-1
  successInk: "#101813", // emerald-5
  warningTint: "#b8c0ba", // heather-1
  warningInk: "#243229", // heather-5
  successDeep: "#2d3530", // emerald-4
  track: "#cddaba" // cream-5
} as const;

export const radius = { card: 22, tile: 14, control: 12, pill: 999 } as const;

// Space Grotesk, one family per weight (custom fonts ignore fontWeight on iOS).
// The files are loaded in src/app/_layout.tsx; Arabic falls back to the system font.
export const fonts = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold"
} as const;
