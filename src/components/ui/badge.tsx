import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "urgent" | "success" | "warning";

// All tones are in-palette and pair a fill with readable text; the label (children)
// means a Badge is never color-only.
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-inset text-ink-muted",
  accent: "bg-accent text-accent-ink",
  urgent: "bg-urgent text-urgent-ink",
  success: "bg-emerald-1 text-emerald-5",
  warning: "bg-heather-1 text-heather-5"
};

export function Badge({
  tone = "neutral",
  icon,
  className,
  children
}: {
  tone?: BadgeTone;
  /** Optional leading icon (e.g. lucide icon at ~12px). */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-semibold leading-none tabular-nums",
    TONES[tone],
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}
