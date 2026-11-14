import { Appearance, DynamicColorIOS, useColorScheme, type OpaqueColorValue } from "react-native";
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
  // A dark film over a sand fill (the rest timer's buttons).
  inkWash: "rgba(10,10,11,0.12)",
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
  inkWash: "rgba(10,10,11,0.12)",
  dangerOnShell: "#b3402e"
};

// The phone's setting at launch. Expo Go and builds report it because app.json says "automatic".
export const scheme: "light" | "dark" = Appearance.getColorScheme() === "light" ? "light" : "dark";

/** A colour from the theme: a plain string, or on iOS a native dynamic colour. Never build strings from it. */
export type Color = string | OpaqueColorValue;
export type Colors = { [K in keyof Palette]: Color };

// On iOS every colour is a native dynamic colour: it follows a light/dark change live, with no reload, even inside
// StyleSheet.create. Android has no such colour, so it keeps the palette of the launch setting (and reloads on a change,
// see src/app/_layout.tsx). Where a plain string is needed (gradients, the widget), use usePalette().
export const colors: Colors =
  process.env.EXPO_OS === "ios"
    ? (Object.fromEntries((Object.keys(night) as (keyof Palette)[]).map((key) => [key, DynamicColorIOS({ light: day[key], dark: night[key] })])) as Colors)
    : scheme === "light"
      ? day
      : night;

/** The palette of the current light/dark setting, as plain strings. Re-renders when the setting changes. */
export function usePalette(): Palette {
  return useColorScheme() === "light" ? day : night;
}

/** The current light/dark setting. Re-renders when it changes. */
export function useScheme(): "light" | "dark" {
  return useColorScheme() === "light" ? "light" : "dark";
}

// Spacing: one 4-point scale. Gaps, padding and margins take a step from here, never a raw number.
export const space = { none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, giant: 64 } as const;

// The iOS text styles at the default Dynamic Type size, and their line heights. "display" is Orbit's own, for one big
// number. Weights come from fonts below (custom fonts ignore fontWeight on iOS).
export const textSize = { caption2: 11, caption1: 12, footnote: 13, subheadline: 15, callout: 16, body: 17, headline: 17, title3: 20, title2: 22, title1: 28, largeTitle: 34, display: 56 } as const;
export const lineHeights = { caption2: 13, caption1: 16, footnote: 18, subheadline: 20, callout: 21, body: 22, headline: 22, title3: 25, title2: 28, title1: 34, largeTitle: 41, display: 60 } as const;

// Corners on the same 4-point scale. card, tile, control and badge name what they are for; pill is a capsule or a circle.
export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, card: 20, tile: 12, control: 8, badge: 4, chip: 999, pill: 999 } as const;

// Shadows as CSS boxShadow. Black at a low alpha reads in both palettes. raised: a card lifted a little; floating: what
// hovers over content (the tab bar, a toast); poster: artwork on a backdrop.
export const shadow = {
  raised: "0 1px 2px rgba(0,0,0,0.06)",
  floating: "0 8px 18px rgba(0,0,0,0.12)",
  poster: "0 8px 16px rgba(0,0,0,0.5)"
} as const;

// Dimmed layer behind a sheet or a menu.
export const scrim = "rgba(0,0,0,0.5)";

// One family per weight (custom fonts ignore fontWeight on iOS); files load in src/app/_layout.tsx.
// JetBrains Mono for Latin and numbers, IBM Plex Sans Arabic for Arabic.
export const fonts = isArabic
  ? { regular: "IBMPlexSansArabic_400Regular", medium: "IBMPlexSansArabic_500Medium", semibold: "IBMPlexSansArabic_600SemiBold", bold: "IBMPlexSansArabic_700Bold" }
  : { regular: "JetBrainsMono_400Regular", medium: "JetBrainsMono_500Medium", semibold: "JetBrainsMono_600SemiBold", bold: "JetBrainsMono_700Bold" };

// Group labels (PINNED, LIFE LOGS) are uppercase with a little tracking (Latin only; Arabic has no case).
// Everything else is sentence case.
export const labelCase = isArabic ? ({} as const) : ({ textTransform: "uppercase", letterSpacing: 0.7 } as const);
