import { useCallback, type KeyboardEvent, type ReactNode } from "react";

type Option<T extends string> = { value: T; label: ReactNode };

/**
 * Drift segmented control. Track = cream well; the selected option is a raised cream pill.
 * Implemented as an ARIA radiogroup with roving tabindex and left/right arrow navigation.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const idx = options.findIndex((o) => o.value === value);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (options.length === 0) return;
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + options.length) % options.length;
      onChange(options[next].value);
    },
    [idx, options, onChange]
  );

  const sizing = size === "sm" ? "h-8 text-[12px]" : "h-9 text-[13px]";

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={["inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-inset p-1", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={[
              "rounded-pill px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep",
              sizing,
              selected
                ? "bg-surface text-ink shadow-[0_1px_2px_oklch(0.2_0.02_150/0.12)]"
                : "text-ink-muted hover:text-ink"
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
