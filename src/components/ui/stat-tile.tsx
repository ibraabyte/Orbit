import type { ReactNode } from "react";

export type StatTone = "neutral" | "accent" | "success" | "urgent";

const TONE_VALUE: Record<StatTone, string> = {
  neutral: "text-ink",
  accent: "text-accent-deep",
  success: "text-emerald-4",
  urgent: "text-urgent"
};

const DIRECTION_MARK = { up: "▲", down: "▼", flat: "–" } as const;

export function StatTile({
  label,
  value,
  hint,
  delta,
  tone = "neutral",
  icon
}: {
  label: string;
  value: ReactNode;
  /** Optional muted sub-line under the value (e.g. "2 overdue"). */
  hint?: ReactNode;
  /** Optional change indicator — arrow + text, so it never relies on color alone. */
  delta?: { value: string; direction?: "up" | "down" | "flat" };
  tone?: StatTone;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-tile border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="uppercase tracking-[0.04em] text-ink-muted" style={{ font: "var(--text-label)" }}>
          {label}
        </span>
        {icon ? <span className="text-ink-muted">{icon}</span> : null}
      </div>
      <div className={`mt-1 ${TONE_VALUE[tone]}`} style={{ font: "var(--text-stat)" }}>
        {value}
      </div>
      {hint != null ? <div className="mt-0.5 text-[11px] text-ink-muted">{hint}</div> : null}
      {delta ? (
        <div className="mt-0.5 text-[11px] font-semibold text-ink-muted">
          <span aria-hidden="true">{DIRECTION_MARK[delta.direction ?? "flat"]} </span>
          {delta.value}
        </div>
      ) : null}
    </div>
  );
}
