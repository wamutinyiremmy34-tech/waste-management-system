/**
 * SkeletonCard — EcoTrack Design System
 *
 * Pulsing placeholder shown while dashboard data is fetching.
 * Replaces blank-looking pages that currently appear on slow connections
 * (3G is common in Uganda) while stat cards and list items load.
 *
 * The animation is `animate-pulse` (Tailwind built-in) — a gentle opacity
 * oscillation that is lightweight and does not trigger vestibular issues
 * unlike translate/scale animations.
 *
 * Variants:
 *   "stat"   — mimics a StatCard (label + large number)
 *   "row"    — mimics a single list row (pickup / schedule / record)
 *   "card"   — generic content card block
 *
 * Usage:
 *   // Stat grid skeleton
 *   <div className="grid grid-cols-3 gap-4">
 *     <SkeletonCard variant="stat" />
 *     <SkeletonCard variant="stat" />
 *     <SkeletonCard variant="stat" />
 *   </div>
 *
 *   // List skeleton
 *   <div className="space-y-3">
 *     {Array.from({ length: 3 }).map((_, i) => (
 *       <SkeletonCard key={i} variant="row" />
 *     ))}
 *   </div>
 */

import type { ReactNode } from "react";

interface SkeletonCardProps {
  variant?: "stat" | "row" | "card";
  className?: string;
}

/** Single shimmer block with configurable dimensions */
function Shimmer({ className }: { className: string }) {
  return <div className={`rounded bg-stone-200 ${className}`} />;
}

export function SkeletonCard({
  variant = "card",
  className = "",
}: SkeletonCardProps): ReactNode {
  return (
    <div
      className={`animate-pulse rounded-lg border border-stone-200 bg-white ${className}`.trim()}
      aria-hidden="true" // purely decorative — screen readers should not narrate skeletons
    >
      {variant === "stat" && (
        <div className="p-4">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="mt-2 h-8 w-16" />
        </div>
      )}

      {variant === "row" && (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3.5 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </div>
          <Shimmer className="ml-4 h-6 w-16 rounded-full" />
        </div>
      )}

      {variant === "card" && (
        <div className="space-y-3 p-4">
          <Shimmer className="h-4 w-3/4" />
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-5/6" />
          <Shimmer className="mt-2 h-3 w-1/3" />
        </div>
      )}
    </div>
  );
}

export default SkeletonCard;
