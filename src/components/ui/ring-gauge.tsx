import type { ReactNode } from "react";

export type RingTone = "accent" | "success" | "urgent";

const TONE_COLOR: Record<RingTone, string> = {
  accent: "var(--color-accent-deep)",
  success: "var(--color-emerald-4)",
  urgent: "var(--color-urgent)"
};

/**
 * Drift ring/donut gauge. The progress arc is a conic-gradient whose sweep angle is dynamic,
 * so it is applied via an inline style (permitted by the CSP's style-src 'unsafe-inline').
 * The center hole uses bg-surface to match the cream card it sits on.
 */
export function RingGauge({
  value,
  size = 84,
  thickness = 10,
  label,
  sublabel,
  tone = "accent",
  ariaLabel
}: {
  /** Progress from 0 to 1. */
  value: number;
  size?: number;
  thickness?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  tone?: RingTone;
  ariaLabel?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = TONE_COLOR[tone];

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `${Math.round(pct)} percent`}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, var(--color-track) ${pct}% 100%)` }}
      />
      <div aria-hidden="true" className="absolute rounded-full bg-surface" style={{ inset: thickness }} />
      {label != null || sublabel != null ? (
        <div className="relative text-center leading-none">
          {label != null ? (
            <div className="text-ink" style={{ font: "var(--text-title)" }}>
              {label}
            </div>
          ) : null}
          {sublabel != null ? (
            <div className="mt-0.5 uppercase tracking-[0.04em] text-ink-muted" style={{ font: "var(--text-label)" }}>
              {sublabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
