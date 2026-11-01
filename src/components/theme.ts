import { isArabic } from "@/lib/i18n";

// Drift: forest chrome, cream cards, one lime accent. Fixed, not a light/dark toggle.
// Urgency is a dark forest pill, never red. Status is always glyph + label.
export const colors = {
  // Chrome (the dark background) and text on it.
  shell: "#101511",
  shellTop: "#18201b",
  onShell: "#edf0e7",
  onShellMuted: "#8a968c",
  // Cards and text on them.
  surface: "#eaefdf",
  surfaceInset: "#d8e3c9", // inner dividers, tracks, wells
  hairline: "#cddaba",
  field: "#f7f9f0",
  ink: "#16231a",
  inkMuted: "#4b5d51",
  inkFaint: "#6f7f73",
  // Lime: hero cards, the Capture button, rings and the active tab. Always with dark ink.
  accent: "#9bdc33",
  accentInk: "#132419",
  accentMuted: "#3b4f1e", // secondary text on lime
  accentDeep: "#5a9313", // large numbers and highlights on cream; 3.1:1, too low for small text
  link: "#3e6b10", // the design's #5a9313 fails AA for 13px links, so links use its tint ink
  accentTint: "#dcefb8",
  accentTintInk: "#3e6b10",
  // Status.
  urgent: "#223227",
  urgentInk: "#eaefdf",
  success: "#2a904b",
  successTint: "#c9ddc1",
  sage: "#6b9174", // second data series
  // Only for destructive text on the dark chrome.
  dangerOnShell: "#f0776a"
} as const;

export const radius = { card: 22, tile: 14, control: 10, chip: 6, pill: 999 } as const;

// One family per weight (custom fonts ignore fontWeight on iOS); files load in src/app/_layout.tsx.
// Space Grotesk for Latin, Almarai for Arabic.
export const fonts = isArabic
  ? { regular: "Almarai_400Regular", medium: "Almarai_400Regular", semibold: "Almarai_700Bold", bold: "Almarai_800ExtraBold" }
  : { regular: "SpaceGrotesk_400Regular", medium: "SpaceGrotesk_500Medium", semibold: "SpaceGrotesk_600SemiBold", bold: "SpaceGrotesk_700Bold" };
