# Orbit Design System — Refined

> **2026-11-06:** the Expo app uses this ("Orbit Refined" from the design handoff), applied to every screen. Live tokens are in `src/components/theme.ts`, parts in `src/components/drift.tsx`, `screen.tsx`, `overlays.tsx`, `tab-bar.tsx`, `chips.tsx` and `auth-panel.tsx`. "Night + Rail" below is the look before it, kept for history. Refined drew the old app (People, Plan, Momentum tabs); those sections stay deleted, and its look is carried onto the screens the app has now.

- **Ground and accent stay:** flat near-black (`#0a0a0b`) and one Sand accent (`#e8c890`). Text is `#f2f0ea`, muted `#8a8a90`.
- **Cards are back:** a section is a card: `surface` (`#131315`) with a 1px `hairline` (`#2a2a2e`) edge and 22px corners (`Card`). Rows inside are divided by the inset colour (`#1e1e21`). Tiles and inputs use 14px corners, badges 6px.
- **Type:** JetBrains Mono for Latin and numbers, IBM Plex Sans Arabic for Arabic. Screen titles 30px semibold; card titles 15px semibold, sentence case. Only group labels (PINNED, LIFE LOGS) are small uppercase.
- **Buttons:** the main button is pale (`#f2f0ea`) with dark text and round 22px corners. Sand fills only the assistant button, Capture marks and the stack action. Card links are outlined sand pills ("Tasks ›").
- **Status is glyph + label, never colour alone:** overdue is a pale tag with dark text, today a dark sand tag, the rest grey tags.
- **Heroes** (next prayer, totals) are cards with a soft sand edge.
- **Tab bar:** docked to the bottom on the card colour with a hairline on top: Today, the raised sand assistant button (mic, "Capture"), More. The open tab is sand, its icon on a soft sand pill.
- **Today:** the date and title with Customize, the next prayer card, the capture bar, then cards: morning brief, digest, quick numbers (readiness from WHOOP is one of them), needs attention (overdue tasks, money due), next up (timed things still ahead; swipe a task to complete it) and health. iPad: overview left, what to do right.
- **Sign in / sign up:** the whole screen is the card colour; the sand Trail mark on a dark tile, "Orbit", what the page does, labelled fields, the pale button.
- **Floating things:** sheets and the date picker keep Liquid Glass (solid `glassSolid` on older iOS, Android and with Reduce Transparency); the iPad sidebar too. The toast is pale with a sand check, like Refined.
- **The widget** keeps its Rail layout, in the Refined text colours.
- **Contrast:** `src/lib/__tests__/theme.test.ts` checks AA for text pairs. Add new pairs there.

# Orbit Design System — Night + Rail

> **2026-11-06 (until Refined, same day):** the Expo app used this ("Orbit Concept" 1a Night and 2b Rail from the design handoff). Live tokens are in `src/components/theme.ts`, parts in `src/components/drift.tsx`, `screen.tsx`, `overlays.tsx`, `tab-bar.tsx` and `swipe-to-done.tsx`; the Today rail logic is `src/lib/rail.ts`. Everything from "Dark Glass" down is older, kept for history.

- **Ground:** flat near-black (`colors.shell`, `#0a0a0b`). Fixed; there is no light mode.
- **One accent, Sand (`#e8c890`):** a line or text almost everywhere; filled only on the main button (the assistant button, the capture +). Solid sand takes black text (`accentInk`).
- **Type:** JetBrains Mono for Latin and numbers, IBM Plex Sans Arabic for Arabic. Small labels are 10–11px uppercase with wide tracking (`labelCase`; Arabic has no case).
- **No cards:** a section is a hairline on top, a small uppercase title and its rows (`Card` in `drift.tsx`). Tiles, inputs and the focus block get a hairline border, not a fill.
- **Status is glyph + label, never colour alone:** urgent is a pale pill with black text; others are outlined.
- **Real Liquid Glass stays on what floats:** tab capsule, back and header buttons, sheets, date picker, toast. Falls back to solid `glassSolid` on older iOS, Android and with Reduce Transparency.
- **Tab bar:** a glass capsule with TODAY, the sand assistant button (mic) in the middle, and MORE. Uppercase labels; the open tab is sand with a short sand underline.
- **Today = Rail:** a big 24-hour clock (sand colon), readiness (WHOOP recovery, else the next prayer) on the other side; then the day as a time line: prayers are ticks, timed things hang off their time, now is a sand line, the next thing is boxed with DONE/OPEN. Tap opens a thing, a sideways swipe completes a task. Passed tasks and money due sit under "Off the rail · overdue". Things more than 3 hours back fold into one "Earlier" row.
- **iPad:** content sits in a centered column (`Screen`, max 760; `wide` screens 1180). From 900px wide, `Columns` puts two columns side by side (Today: the rail left, everything else right). Sheets, toast and the tab capsule are centered.
- **Empty states:** one line saying what to do, and an example line that opens the assistant with it typed in.
- **Contrast:** `src/lib/__tests__/theme.test.ts` checks AA for text pairs on the black ground. Add new pairs there.

# Orbit Design System — Dark Glass

> **2026-11-02 to 2026-11-05:** the Expo app used this. Live tokens are in `src/components/theme.ts`, parts in `src/components/drift.tsx`, `screen.tsx`, `overlays.tsx` and `tab-bar.tsx`. Everything from "Drift" down is the older look, kept for history.

- **Backdrop:** dark forest (`colors.shell`) with soft lime and sage light (`backdrop` in `theme.ts`). Fixed; there is no light mode.
- **Real Liquid Glass only on what floats:** tab capsule, Capture button, back and header buttons, action sheet, date picker, toast. Use `Glass` from `drift.tsx`. It falls back to a solid surface on older iOS, on Android and with Reduce Transparency. Never put it inside `overflow: hidden`, and never on content cards.
- **Cards:** translucent white with a hairline and a lit top edge, no blur. Hero cards are the same in a lime tint with pale lime text (`heroInk`).
- **Lime:** solid lime always takes dark ink (`accentInk`). It is for the main action and what is selected.
- **Pale pill (`urgent`):** the selected segment and urgent badges, always with a glyph or label. Destructive text uses `dangerOnShell`.
- **Ring gauges** need a solid middle (`ringHole`, `heroHole`), since the arc is drawn behind it.
- **Contrast:** `src/lib/__tests__/theme.test.ts` flattens the translucent colors onto the brightest part of the backdrop and checks AA. Add new text pairs there.

# Orbit Design System — "Drift"

> **2026-11-01:** the Expo app follows the "Orbit Screens" redesign from Claude Design. Live tokens are in `src/components/theme.ts`, parts in `src/components/drift.tsx`, `screen.tsx` and `overlays.tsx`. Sections below that mention Tailwind describe the archived web version (tag `web-final`).

> This describes the web version (git tag `web-final`), built with Tailwind. The Expo app uses the same look:
> its tokens (converted to hex) live in `src/components/theme.ts`, the building blocks (Card, ListRow, Badge, StatTile,
> RingGauge, ProgressBar, CheckItem, EmptyState, PageHeader, Brand; Feather icons) in `src/components/drift.tsx`, and the
> floating bottom bar with the lime Capture button in `src/components/tab-bar.tsx`. Screens opened from More keep a native
> header in Drift colors.

## Overview

Orbit is a personal life command center for repeated daily use. Drift is its visual language: a **mobile-first** interface with a dark forest gradient shell, warm cream cards, and a single vivid lime accent. It should feel calm, tactile, and legible — content on cream, chrome on forest, one accent for what matters.

Styling is **Tailwind CSS v4** (CSS-first) with design tokens declared in [globals.css](src/app/globals.css) `@theme`, plus a shrinking `@layer legacy` block for the few screens not yet on Drift (auth, 404, onboarding, and the Settings utility panels).

## Color

OKLCH only. Tokens are declared once in `@theme` and consumed as Tailwind utilities (`bg-surface`, `text-ink`, `border-hairline`, `bg-accent text-accent-ink`, …). This is **fixed chrome-dark + content-light**, not a `prefers-color-scheme` toggle — pick the token for the surface you are on.

- **Ramps:** `cream-1..5` (content), `forest-1..5` (shell), `emerald`, `heather`, `boho`, `sprout-1..5` (lime).
- **Shell (dark):** `--color-shell` (forest-5) → `--color-shell-top`; text on it is `--color-on-shell` / `--color-on-shell-muted`.
- **Surface (cream cards):** `--color-surface` (cream-2), `--color-surface-inset` (cream-4), hairline `--color-hairline` (cream-5); text is `--color-ink` / `--color-ink-muted`.
- **Accent (lime):** `--color-accent` — **always pair with `--color-accent-ink` (dark), never white**. `--color-accent-deep` is the lime for graphs/focus rings on cream.
- **Status (in-palette):** `--color-urgent` (attention, NOT red) + `--color-urgent-ink`, `--color-success`, plus emerald/heather tints for badges. Status is never conveyed by color alone — always pair with an icon, label, or shape.

## Typography

**Space Grotesk** (self-hosted via `next/font/google` — build-time, same-origin, CSP-safe; no CDN at runtime). Type scale lives as `font`-shorthand custom properties (`--text-h1`, `--text-title`, `--text-meta`, `--text-label`, …) applied via `style={{ font: "var(--text-h1)" }}`. Page titles and section labels sit on the dark shell, so they use `on-shell` text; card content uses `ink`.

## Layout

Mobile-first, one centered column (`max-w-[440px]`) on every viewport. The shell ([app-shell.tsx](src/components/app-shell.tsx)) is a dark forest gradient with a slim top bar (brand + Hide + Sign out) and a **fixed glass bottom nav**: 4 tabs (Today / Plan / Momentum / More) with a center lime **Capture FAB** → `/command`. Safe-area aware (`viewportFit: "cover"`). Cards are single-level (22px radius); no nested cards.

## Components (`src/components/ui/`)

Shared primitives, all token-driven: `Card`, `Badge` (pill, tones), `Chip`, `StatTile`, `RingGauge` (conic-gradient), `Segmented` (radiogroup), `ListRow`, `CheckItem` (lime circle check), `ProgressBar`, `EmptyState`, `PageHeader`, `LoadingBlock`, `Button`/`ButtonLink`, and form controls (`Field`/`Input`/`Textarea`/`Select`/`Label`). Legacy `ModuleCard`/`EmptyState`/`PageHeader`/`LoadingBlock` delegate to these. Radii: card 22px, tile 14px, control 12px, pill 999px. Use lucide icons; skeletons over spinners.

## Motion & Accessibility

150–220ms transitions for hover/selected/focus; disabled under `prefers-reduced-motion: reduce` (skeleton shimmer and nav/FAB motion respect it). Every control has visible hover, `focus-visible` ring (`ring-accent-deep`, readable on both cream and forest), active, disabled, loading, empty, and error states. Inline styles (ring gauges, shell gradient) are permitted by the app CSP's `style-src 'unsafe-inline'`.
