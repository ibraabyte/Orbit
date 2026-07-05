import type { ComponentProps, ReactNode } from "react";

// Cream-well controls that read against the cream card surface.
const controlBase =
  "w-full rounded-control border border-hairline bg-surface-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:border-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep/30 disabled:opacity-50";

function join(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={join(controlBase, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={join(controlBase, "min-h-24 resize-y", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={join(controlBase, "h-10", className)} {...rest}>
      {children}
    </select>
  );
}

export function Label({ className, children, ...rest }: ComponentProps<"label">) {
  return (
    <label className={join("text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-muted", className)} {...rest}>
      {children}
    </label>
  );
}

/** Label + control wrapper. Pass a string label (rendered as <label>) or a custom node. */
export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {typeof label === "string" ? <Label htmlFor={htmlFor}>{label}</Label> : label}
      {children}
    </div>
  );
}
