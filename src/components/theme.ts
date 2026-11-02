import { isArabic } from "@/lib/i18n";

// Dark glass: a calm forest backdrop, translucent cards with a lit edge, one lime accent. Fixed, not a light/dark toggle.
// Real Liquid Glass is only on what floats (see Glass in drift.tsx). Urgency is a pale pill, never red. Status is always glyph + label.
export const colors = {
  // Chrome (the dark background) and text on it.
  shell: "#0c120e",
  shellTop: "#141c16",
  onShell: "#f1f4ea",
  onShellMuted: "#a3afa6",
  // Cards and text on them. Cards are translucent, so anything drawn behind them shows through.
  surface: "rgba(255,255,255,0.07)",
  surfaceInset: "rgba(255,255,255,0.09)", // inner dividers, tracks, wells
  hairline: "rgba(255,255,255,0.12)",
  field: "rgba(0,0,0,0.25)",
  ink: "#f1f4ea",
  inkMuted: "#c6d0c8",
  inkFaint: "#aab6ad",
  // Solid stand-in for glass: older iOS, Android, Reduce Transparency.
  glassSolid: "#232b26",
  // Ring gauges need a solid middle, because the arc is drawn behind it.
  ringHole: "#141b16",
  // Lime: the Capture button, rings and the active tab. Solid lime always takes dark ink.
  accent: "#9bdc33",
  accentInk: "#132419",
  accentDeep: "#a8e24a", // large numbers and highlights on cards
  link: "#b5e56a",
  accentTint: "rgba(155,220,51,0.16)",
  accentTintInk: "#c4ec80",
  // Hero cards: lime-tinted glass with pale lime text.
  hero: "rgba(155,220,51,0.13)",
  heroEdge: "rgba(155,220,51,0.26)",
  heroInk: "#e9f7cf",
  accentMuted: "#b9cf95", // secondary text on a hero
  heroHole: "#141d10",
  // Status.
  urgent: "#edf0e7",
  urgentInk: "#132419",
  success: "#8ae3a8",
  successTint: "rgba(111,207,142,0.16)",
  sage: "#8fb89a", // second data series
  // Destructive text.
  dangerOnShell: "#ff9f92"
} as const;

// Soft light behind everything, so translucent cards have something to catch.
export const backdrop = `radial-gradient(circle at 12% 0%, rgba(155,220,51,0.13), transparent 55%), radial-gradient(circle at 100% 55%, rgba(143,184,154,0.12), transparent 50%), linear-gradient(180deg, ${colors.shellTop} 0%, ${colors.shell} 60%)`;

export const radius = { card: 24, tile: 16, control: 12, chip: 7, pill: 999 } as const;

// One family per weight (custom fonts ignore fontWeight on iOS); files load in src/app/_layout.tsx.
// Space Grotesk for Latin, Almarai for Arabic.
export const fonts = isArabic
  ? { regular: "Almarai_400Regular", medium: "Almarai_400Regular", semibold: "Almarai_700Bold", bold: "Almarai_800ExtraBold" }
  : { regular: "SpaceGrotesk_400Regular", medium: "SpaceGrotesk_500Medium", semibold: "SpaceGrotesk_600SemiBold", bold: "SpaceGrotesk_700Bold" };
