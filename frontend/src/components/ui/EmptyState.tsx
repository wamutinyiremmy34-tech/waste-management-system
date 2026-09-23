/**
 * EmptyState — EcoTrack Design System
 *
 * Replaces the weak dashed-border paragraph used throughout the app:
 *   <p className="rounded-lg border border-dashed border-stone-300 p-6
 *                 text-center text-sm text-stone-500">...</p>
 *
 * Provides a properly structured empty state with optional icon, title,
 * description, and CTA button. The dashed border is preserved as the
 * visual container since it matches the existing EcoTrack aesthetic.
 *
 * Usage:
 *   // Simple (matches current pattern exactly)
 *   <EmptyState description="No pickups yet. Request your first one." />
 *
 *   // With icon and CTA
 *   <EmptyState
 *     icon={<TruckIcon className="h-8 w-8" />}
 *     title="No pickups assigned"
 *     description="Your assigned pickups will appear here."
 *     action={{ label: "Request pickup", onClick: () => router.push('/pickups/new') }}
 *   />
 *
 *   // With a link CTA
 *   <EmptyState
 *     title="No schedules yet"
 *     description="Set up a recurring pickup schedule."
 *     action={{ label: "New schedule", href: "/schedules" }}
 *   />
 */

import type { ReactNode } from "react";
import Link from "next/link";

interface EmptyStateAction {
  label: string;
  /** If href is provided, renders a Next.js Link; otherwise a <button> */
  href?: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  /** Optional icon — rendered above the title, centered */
  icon?: ReactNode;
  /** Bold heading line. Omit for simple single-line empty states. */
  title?: string;
  /** Descriptive text. Required for meaningful empty states. */
  description: string;
  /** Optional primary CTA */
  action?: EmptyStateAction;
  /** Additional Tailwind classes for the outer container */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps): ReactNode {
  return (
    <div
      className={`rounded-lg border border-dashed border-stone-300 bg-white px-6 py-8 text-center ${className}`.trim()}
    >
      {icon && (
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {title && (
        <p className="mb-1 text-sm font-semibold text-stone-700">{title}</p>
      )}

      <p className="text-sm text-stone-500">{description}</p>

      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-[36px] items-center rounded-md bg-eco-900 px-4 py-2 text-sm font-semibold text-white hover:bg-eco-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-[36px] items-center rounded-md bg-eco-900 px-4 py-2 text-sm font-semibold text-white hover:bg-eco-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
