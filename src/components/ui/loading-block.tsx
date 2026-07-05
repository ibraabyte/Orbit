/** Drift skeleton loader — cream tiles with a pulse (disabled under reduced-motion). */
export function LoadingBlock() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Loading page content">
      <div className="grid grid-cols-2 gap-3" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-tile border border-hairline bg-surface p-3">
            <div className="h-3 w-16 animate-pulse rounded-pill bg-surface-inset motion-reduce:animate-none" />
            <div className="mt-2 h-6 w-20 animate-pulse rounded-pill bg-surface-inset motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div key={panel} className="rounded-card border border-hairline bg-surface p-4">
            <div className="h-4 w-32 animate-pulse rounded-pill bg-surface-inset motion-reduce:animate-none" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-pill bg-surface-inset motion-reduce:animate-none" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded-pill bg-surface-inset motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
