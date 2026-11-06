import { isArabic } from "@/lib/i18n";

// Refined ("Orbit Refined" from the design handoff): the same near-black ground and one sand accent as Night, but
// content sits on cards again: a lifted surface with a hairline edge and big round corners, sentence-case titles,
// pale buttons with dark text. No colour for status: always glyph + label. Fixed, not a light/dark toggle.
export const colors = {
  // The black ground and text on it.
  shell: "#0a0a0b",
  shellTop: "#0a0a0b",
  onShell: "#f2f0ea",
  onShellMuted: "#8a8a90",
  // Cards: a lifted surface with a hairline edge. Inset is the well inside a card (dividers, tracks, chips, fields).
  surface: "#131315",
  surfaceInset: "#1e1e21",
  hairline: "#2a2a2e",
  field: "#1e1e21",
  ink: "#f2f0ea",
  inkMuted: "#8a8a90",
  inkFaint: "#87878d",
  // Solid stand-in for glass: older iOS, Android, Reduce Transparency.
  glassSolid: "#131315",
  // Ring gauges need a solid middle, because the arc is drawn behind it. Rings sit on cards.
  ringHole: "#131315",
  // Sand: the one accent. Filled for the main action (the assistant button, Capture); elsewhere a line or text.
  // Solid sand takes black text.
  accent: "#e8c890",
  accentInk: "#0a0a0b",
  accentDeep: "#e8c890", // large numbers and highlights
  link: "#e8c890",
  accentLine: "rgba(232,200,144,0.45)", // outlined sand pills ("Tasks ›")
  accentTint: "#2a2418",
  accentTintInk: "#e8c890",
  // Heroes: a card with a sand edge (next prayer, readiness).
  hero: "#131315",
  heroEdge: "rgba(232,200,144,0.35)",
  heroInk: "#f2f0ea",
  accentMuted: "#8a8a90", // secondary text on a hero
  heroHole: "#131315",
  // Status: a pale pill with dark text, always with a glyph or label.
  urgent: "#f2f0ea",
  urgentInk: "#131315",
  success: "#f2f0ea",
  successTint: "#1e1e21",
  sage: "#5d5b56", // second data series: grey bars beside the sand one
  // Error text.
  dangerOnShell: "#f2a091"
} as const;

// The ground is flat black.
export const backdrop = `linear-gradient(180deg, ${colors.shellTop} 0%, ${colors.shell} 100%)`;

export const radius = { card: 22, tile: 14, control: 10, badge: 6, chip: 999, pill: 999 } as const;

// One family per weight (custom fonts ignore fontWeight on iOS); files load in src/app/_layout.tsx.
// JetBrains Mono for Latin and numbers, IBM Plex Sans Arabic for Arabic.
export const fonts = isArabic
  ? { regular: "IBMPlexSansArabic_400Regular", medium: "IBMPlexSansArabic_500Medium", semibold: "IBMPlexSansArabic_600SemiBold", bold: "IBMPlexSansArabic_700Bold" }
  : { regular: "JetBrainsMono_400Regular", medium: "JetBrainsMono_500Medium", semibold: "JetBrainsMono_600SemiBold", bold: "JetBrainsMono_700Bold" };

// Group labels (PINNED, LIFE LOGS) are uppercase with a little tracking (Latin only; Arabic has no case).
// Everything else is sentence case.
export const labelCase = isArabic ? ({} as const) : ({ textTransform: "uppercase", letterSpacing: 0.7 } as const);
