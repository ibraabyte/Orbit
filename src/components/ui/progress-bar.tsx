/** Drift linear progress bar — cream track with a lime (or success) fill. */
export function ProgressBar({
  value,
  max = 100,
  ariaLabel,
  tone = "accent"
}: {
  value: number;
  max?: number;
  ariaLabel?: string;
  tone?: "accent" | "success";
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0)) * 100;
  const fill = tone === "success" ? "bg-emerald-4" : "bg-accent-deep";

  return (
    <div
      className="h-2 w-full overflow-hidden rounded-pill bg-track"
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-pill ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
