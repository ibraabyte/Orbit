import { useId, type ElementType, type ReactNode } from "react";

type CardProps = {
  /** Optional heading rendered in the card header row. */
  title?: string;
  /** Small muted line under the title. */
  kicker?: string;
  /** Trailing header content (button, badge, link). */
  action?: ReactNode;
  /** Element to render as. Defaults to <section>. */
  as?: ElementType;
  /** Toggle default padding. */
  padding?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Drift surface card: cream fill, 22px radius, hairline border.
 * Backs ModuleCard and is the base container primitive across screens.
 */
export function Card({ title, kicker, action, as, padding = true, className, children }: CardProps) {
  const titleId = useId();
  const Tag: ElementType = as ?? "section";
  const hasHeader = Boolean(title || action);

  const classes = [
    "relative isolate rounded-card border border-hairline bg-surface text-ink",
    "shadow-[0_1px_2px_oklch(0.2_0.02_150/0.05),0_10px_24px_oklch(0.2_0.02_150/0.05)]",
    padding ? "p-4" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...(title ? { "aria-labelledby": titleId } : {})}>
      {hasHeader ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 id={titleId} className="text-ink" style={{ font: "var(--text-title)" }}>
                {title}
              </h2>
            ) : null}
            {kicker ? (
              <p className="mt-1 text-ink-muted" style={{ font: "var(--text-meta)" }}>
                {kicker}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
