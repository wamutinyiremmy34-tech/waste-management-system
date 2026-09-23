"use client";

/**
 * QuickAction — EcoTrack Design System
 *
 * Touch-friendly action card for the citizen dashboard quick-actions grid.
 * Renders either a Next.js Link (href) or a <button> (onClick).
 *
 * Minimum height 64px — adequate touch target on mobile.
 * Icon is decorative (aria-hidden); label provides the accessible name.
 *
 * Usage:
 *   <QuickAction
 *     href="/pickups/new"
 *     iconPath="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
 *     label="Request Pickup"
 *   />
 *   <QuickAction
 *     onClick={openComplaints}
 *     iconPath="M12 9v3.75m-9.303..."
 *     label="Report Issue"
 *     description="Illegal dumping, missed collection"
 *   />
 */

import type { ReactNode } from "react";
import Link from "next/link";

interface QuickActionProps {
  /** SVG path `d` attribute — 24×24 viewBox stroke icon */
  iconPath: string;
  /** Primary action label */
  label: string;
  /** Optional short supporting description */
  description?: string;
  /** Navigate to this href (renders a Link) */
  href?: string;
  /** Fire onClick handler (renders a button) */
  onClick?: () => void;
  /** Additional Tailwind classes */
  className?: string;
}

function ActionIcon({ path }: { path: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      className="h-6 w-6 shrink-0"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

// Arrow-right for affordance
const ARROW_PATH =
  "M8.25 4.5l7.5 7.5-7.5 7.5";

const BASE =
  "group flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4 " +
  "text-left transition-all hover:border-eco-200 hover:bg-eco-50 hover:shadow-sm " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700 " +
  "min-h-[64px]";

export function QuickAction({
  iconPath,
  label,
  description,
  href,
  onClick,
  className = "",
}: QuickActionProps): ReactNode {
  const content = (
    <>
      {/* Icon bubble */}
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-eco-50 text-eco-700 group-hover:bg-eco-200 transition-colors"
        aria-hidden="true"
      >
        <ActionIcon path={iconPath} />
      </span>

      {/* Text */}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-stone-900 group-hover:text-eco-900">
          {label}
        </span>
        {description && (
          <span className="block truncate text-xs text-stone-500 mt-0.5">
            {description}
          </span>
        )}
      </span>

      {/* Chevron */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-4 w-4 shrink-0 text-stone-300 group-hover:text-eco-600 transition-colors"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ARROW_PATH} />
      </svg>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${BASE} ${className}`.trim()}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BASE} ${className}`.trim()}
    >
      {content}
    </button>
  );
}

export default QuickAction;
