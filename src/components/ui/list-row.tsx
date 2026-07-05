import type { ReactNode } from "react";

type ListRowProps = {
  /** Leading slot — icon, avatar, or CheckItem. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned secondary text (time, amount). */
  meta?: ReactNode;
  /** Trailing slot — badge, chevron, action buttons. */
  trailing?: ReactNode;
  /** Renders an <a> when set. */
  href?: string;
  /** Renders a <button> when set (and no href). */
  onClick?: () => void;
  className?: string;
};

/** Drift list row on a cream surface. Backs the legacy .list-row. */
export function ListRow({ leading, title, subtitle, meta, trailing, href, onClick, className }: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const classes = [
    "flex w-full items-center gap-3 rounded-tile border border-hairline bg-surface px-3 py-2.5 text-left",
    interactive
      ? "transition-colors hover:bg-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep"
      : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leading != null ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-ink">{title}</div>
        {subtitle != null ? <div className="truncate text-[12.5px] text-ink-muted">{subtitle}</div> : null}
      </div>
      {meta != null ? <div className="shrink-0 text-right text-[12px] text-ink-muted">{meta}</div> : null}
      {trailing != null ? <div className="shrink-0">{trailing}</div> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} className={classes}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
