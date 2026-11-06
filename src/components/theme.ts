import { isArabic } from "@/lib/i18n";

// Night (Orbit Concept, "WHOOP ground"): near-black, hairlines instead of cards, one sand accent used as a line and as
// text, filled only on the main button. Real Liquid Glass stays on what floats (see Glass in drift.tsx).
// No colour for status: always glyph + label. Fixed, not a light/dark toggle.
export const colors = {
  // The black ground and text on it.
  shell: "#0a0a0b",
  shellTop: "#0a0a0b",
  onShell: "#ece9e2",
  onShellMuted: "#8f8d87",
  // Sections sit straight on the ground. surface is a barely lifted well for inputs, tiles and bordered rows.
  surface: "#121214",
  surfaceInset: "#1d1d20", // inner dividers, tracks, wells
  hairline: "#2a2a2e",
  field: "#121214",
  ink: "#ece9e2",
  inkMuted: "#a19f98",
  inkFaint: "#807e78",
  // Solid stand-in for glass: older iOS, Android, Reduce Transparency.
  glassSolid: "#1a1a1d",
  // Ring gauges need a solid middle, because the arc is drawn behind it.
  ringHole: "#0a0a0b",
  // Sand: the one accent. Filled only for the main action; elsewhere it is a line or text. Solid sand takes black text.
  accent: "#e8c890",
  accentInk: "#0a0a0b",
  accentDeep: "#e8c890", // large numbers and highlights
  link: "#e8c890",
  accentTint: "#221e17",
  accentTintInk: "#e8c890",
  // Heroes: one big number on the ground, no fill.
  hero: "#0a0a0b",
  heroEdge: "#2a2a2e",
  heroInk: "#ece9e2",
  accentMuted: "#a19f98", // secondary text on a hero
  heroHole: "#0a0a0b",
  // Status: a pale pill with black text, always with a glyph or label.
  urgent: "#ece9e2",
  urgentInk: "#0a0a0b",
  success: "#c9c6bd",
  successTint: "#1d1d20",
  sage: "#5d5b56", // second data series: grey bars beside the sand one
  // Error text.
  dangerOnShell: "#f2a091"
} as const;

// The ground is flat black.
export const backdrop = `linear-gradient(180deg, ${colors.shellTop} 0%, ${colors.shell} 100%)`;

export const radius = { card: 14, tile: 12, control: 10, chip: 999, pill: 999 } as const;

// One family per weight (custom fonts ignore fontWeight on iOS); files load in src/app/_layout.tsx.
// JetBrains Mono for Latin and numbers, IBM Plex Sans Arabic for Arabic.
export const fonts = isArabic
  ? { regular: "IBMPlexSansArabic_400Regular", medium: "IBMPlexSansArabic_500Medium", semibold: "IBMPlexSansArabic_600SemiBold", bold: "IBMPlexSansArabic_700Bold" }
  : { regular: "JetBrainsMono_400Regular", medium: "JetBrainsMono_500Medium", semibold: "JetBrainsMono_600SemiBold", bold: "JetBrainsMono_700Bold" };

// Small labels are uppercase with wide tracking (Latin only; Arabic has no case).
export const labelCase = isArabic ? ({} as const) : ({ textTransform: "uppercase", letterSpacing: 1.2 } as const);
