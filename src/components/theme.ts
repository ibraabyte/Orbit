import { Appearance } from "react-native";
import { isArabic } from "@/lib/i18n";

// Refined ("Orbit Refined" from the design handoff): one sand accent, content on cards (a lifted surface with a hairline
// edge and big round corners), sentence-case titles, pale buttons with dark text. No colour for status: always glyph + label.
// Two palettes, Night and Day, picked once at launch from the phone's light/dark setting. Styles are built at module load,
// so a change of setting reloads the app (see useSchemeReload in src/app/_layout.tsx).
export const night = {
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
  input: "#26262a", // sign-in fields
  ink: "#f2f0ea",
  inkMuted: "#8a8a90",
  inkFaint: "#87878d",
  // Solid stand-in for glass: older iOS, Android, Reduce Transparency.
  glassSolid: "#131315",
  glassTint: "rgba(10,10,11,0.6)", // the sidebar's glass
  sheet: "rgba(10,10,11,0.86)", // Capture's sheet
  edge: "rgba(255,255,255,0.16)", // an outline on glass or the ground
  // Ring gauges need a solid middle, because the arc is drawn behind it. Rings sit on cards.
  ringHole: "#131315",
  // Sand: the one accent. Filled for the main action (the assistant button, Capture), rings, bars and switches.
  // Solid sand takes black text. Sand text and icons use link / accentDeep.
  accent: "#d6be8c",
  accentInk: "#0a0a0b",
  accentDeep: "#d6be8c", // large numbers and highlights
  link: "#d6be8c",
  accentLine: "rgba(214,190,140,0.45)", // outlined sand pills ("Tasks ›")
  accentTint: "#2a2418",
  accentTintInk: "#d6be8c",
  accentWash: "rgba(214,190,140,0.14)", // a faint sand pad behind an icon
  // Heroes: a card with a sand edge (next prayer, readiness).
  hero: "#131315",
  heroEdge: "rgba(214,190,140,0.35)",
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
};

export type Palette = typeof night;

// Day: a warm paper ground (Madar's cream) with white cards. Sand deepens so rings and bars still show on white,
// and sand text turns bronze to stay readable. The pale pills of Night become dark pills.
export const day: Palette = {
  shell: "#f4f0e8",
  shellTop: "#f4f0e8",
  onShell: "#1a1a1c",
  onShellMuted: "#66625a",
  surface: "#ffffff",
  surfaceInset: "#efe9de",
  hairline: "#e3ddd0",
  field: "#efe9de",
  input: "#ffffff",
  ink: "#1a1a1c",
  inkMuted: "#66625a",
  inkFaint: "#67625a",
  glassSolid: "#ffffff",
  glassTint: "rgba(244,240,232,0.6)",
  sheet: "rgba(244,240,232,0.9)",
  edge: "rgba(0,0,0,0.12)",
  ringHole: "#ffffff",
  accent: "#b08e50",
  accentInk: "#0a0a0b",
  accentDeep: "#7a5a20",
  link: "#7a5a20",
  accentLine: "rgba(122,90,32,0.4)",
  accentTint: "#f1e6cf",
  accentTintInk: "#6b4f1c",
  accentWash: "rgba(176,142,80,0.16)",
  hero: "#ffffff",
  heroEdge: "rgba(176,142,80,0.5)",
  heroInk: "#1a1a1c",
  accentMuted: "#66625a",
  heroHole: "#ffffff",
  urgent: "#1a1a1c",
  urgentInk: "#f4f0e8",
  success: "#1a1a1c",
  successTint: "#efe9de",
  sage: "#c9c2b4",
  dangerOnShell: "#b3402e"
};

// Read once at launch. Expo Go and builds report the phone's setting because app.json says "automatic".
export const scheme: "light" | "dark" = Appearance.getColorScheme() === "light" ? "light" : "dark";
export const colors: Palette = scheme === "light" ? day : night;

// The ground is flat.
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
