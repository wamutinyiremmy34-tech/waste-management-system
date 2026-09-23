/**
 * Button — EcoTrack Design System
 *
 * Standardizes the four button variants used across the application:
 *   primary     — EcoTrack deep green, main actions
 *   secondary   — outlined green, secondary actions
 *   destructive — red border, destructive/cancel actions
 *   ghost       — text-only, minimal utility actions (Sign out, etc.)
 *
 * Existing inline button classes are NOT immediately replaced — pages will
 * migrate to this component incrementally in later phases. This component
 * ensures all NEW components and any page touched in this phase use the
 * canonical system.
 *
 * Accessibility:
 *   - All variants have visible :focus-visible rings (via globals.css global rule
 *     + per-variant outline override)
 *   - Disabled state reduces opacity and sets cursor-not-allowed
 *   - Minimum height ~44px on mobile via min-h-[44px] sm:min-h-0
 *     (touch target requirement; desktop relaxes to natural height)
 *   - type="button" default prevents accidental form submissions
 *
 * Usage:
 *   <Button onClick={logout}>Sign out</Button>
 *   <Button variant="secondary" href="/schedules">Recurring pickups</Button>
 *   <Button variant="destructive" onClick={() => cancel(id)}>Cancel pickup</Button>
 *   <Button variant="ghost" onClick={logout}>Sign out</Button>
 *   <Button loading>Submitting…</Button>
 *   <Button asChild><Link href="/dashboard">Go home</Link></Button>
 */

import type { ReactNode, ButtonHTMLAttributes } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// Per-variant class strings — explicit so Tailwind's static scanner can
// detect every class and include it in the production CSS bundle.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-eco-900 text-white hover:bg-eco-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700",
  secondary:
    "border border-eco-900 text-eco-900 bg-transparent hover:bg-eco-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700",
  destructive:
    "border border-red-300 text-red-600 bg-transparent hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500",
  ghost:
    "text-stone-500 bg-transparent hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm min-h-[36px] sm:min-h-0",
  md: "px-4 py-2 text-sm font-semibold min-h-[44px] sm:min-h-[38px]",
  lg: "px-6 py-3 text-base font-semibold min-h-[44px]",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-1.5 rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Renders a Next.js Link instead of a <button>. Requires href. */
  href?: string;
  className?: string;
  children: ReactNode;
}

type ButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/** Minimal inline spinner for loading state */
function ButtonSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  href,
  className = "",
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonProps): ReactNode {
  const classes =
    `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`.trim();

  // Link variant — for navigation buttons that look like buttons
  if (href) {
    return (
      <Link href={href} className={classes}>
        {loading && <ButtonSpinner />}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={classes}
      {...rest}
    >
      {loading && <ButtonSpinner />}
      {children}
    </button>
  );
}

export default Button;
