import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-95",
  secondary: "border border-hairline bg-surface text-ink hover:bg-surface-inset",
  ghost: "text-ink hover:bg-surface-inset",
  danger: "bg-danger text-white hover:brightness-95"
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1 px-3 text-[12px]",
  md: "h-10 gap-2 px-4 text-[14px]"
};

function buttonClasses(variant: Variant, size: Size, className?: string) {
  return [
    "inline-flex shrink-0 items-center justify-center rounded-pill font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-deep disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "secondary", size = "md", type = "button", className, children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "secondary", size = "md", className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
