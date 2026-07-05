import type { ReactNode } from "react";

type ChipProps = {
  /** Selected state — active chips fill with the lime accent. */
  active?: boolean;
  /** Optional leading icon. */
  icon?: ReactNode;
  /** Optional trailing count pill. */
  count?: number | string;
  /** If provided, renders an <a> instead of a <button>. */
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
};

/**
 * Drift chip: pill filter/collection control. Inactive = cream well; active = lime accent
 * (bg-accent + text-accent-ink). Backs the legacy .collection-chip and new selectable chips.
 */
export function Chip({ active = false, icon, count, href, onClick, className, children }: ChipProps) {
  const classes = [
    "inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-3 text-[13px] font-semibold transition-transform",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep",
    active
      ? "border-transparent bg-accent text-accent-ink"
      : "border-hairline bg-surface-inset text-ink hover:-translate-y-px",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon}
      <span className="truncate">{children}</span>
      {count != null ? (
        <span className="ml-0.5 inline-flex min-w-[20px] items-center justify-center rounded-pill bg-surface px-1.5 text-[11px] font-semibold tabular-nums text-ink-muted">
          {count}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}
