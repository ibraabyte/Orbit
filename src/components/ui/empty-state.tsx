import type { ReactNode } from "react";

/** Drift empty state: centered, dashed cream well. Backs the legacy .empty-state. */
export function EmptyState({
  icon,
  title,
  children
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tile border border-dashed border-hairline bg-surface-inset px-4 py-8 text-center">
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      {title ? <div className="text-[14px] font-semibold text-ink">{title}</div> : null}
      {children ? <div className="text-[12.5px] text-ink-muted">{children}</div> : null}
    </div>
  );
}
