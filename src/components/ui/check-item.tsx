import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * Drift check item — a real <input type="checkbox"> styled as a lime circle with a check.
 * The check mark (a shape, not just color) conveys the checked state, so it stays accessible.
 */
export function CheckItem({
  checked,
  onChange,
  label,
  id,
  disabled
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label htmlFor={inputId} className="flex cursor-pointer select-none items-center gap-3">
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full border border-hairline bg-surface checked:border-transparent checked:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none relative h-3.5 w-3.5 text-accent-ink opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="text-[14px] text-ink">{label}</span>
    </label>
  );
}
