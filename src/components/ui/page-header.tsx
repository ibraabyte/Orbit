import type { ReactNode } from "react";

/** Drift page header: big Space Grotesk title, muted subtitle, optional trailing toolbar. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="uppercase tracking-[0.04em] text-on-shell-muted" style={{ font: "var(--text-label)" }}>
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-on-shell" style={{ font: "var(--text-h1)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-on-shell-muted" style={{ font: "var(--text-meta)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
