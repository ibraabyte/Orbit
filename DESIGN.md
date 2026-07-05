# Orbit Design System — "Drift"

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
