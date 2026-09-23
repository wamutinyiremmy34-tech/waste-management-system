/**
 * StatCard — EcoTrack Design System
 *
 * Reusable dashboard statistic card.
 * Replaces the 20+ inline `rounded-lg border border-stone-200 bg-white p-4`
 * stat blocks duplicated across dashboard, collector, company, recycler pages.
 *
 * Usage:
 *   <StatCard label="Active jobs" value={5} />
 *   <StatCard label="Completed today" value={12} highlight />
 *   <StatCard label="Failed collections" value={2} warn />
 *   <StatCard label="Completion rate" value="87%" highlight supporting="last 30 days" />
 *   <StatCard label="Waste collected" value="142 kg" icon={<TruckIcon />} />
 */

import type { ReactNode } from "react";

interface StatCardProps {
  /** Short label shown above the number */
  label: string;
  /** The primary statistic — number or pre-formatted string */
  value: string | number | null | undefined;
  /** Small text shown below the value for extra context */
  supporting?: string;
  /** Optional icon rendered to the left of the value */
  icon?: ReactNode;
  /**
   * Positive emphasis: renders value in EcoTrack green.
   * Use for good outcomes (completed, recycled, high rate).
   */
  highlight?: boolean;
  /**
   * Warning emphasis: renders value in amber/red depending on severity.
   * Use for negative outcomes (failed, overdue, unresolved).
   */
  warn?: boolean;
  /** Additional Tailwind classes for the outer card container */
  className?: string;
}

export function StatCard({
  label,
  value,
  supporting,
  icon,
  highlight = false,
  warn = false,
  className = "",
}: StatCardProps): ReactNode {
  // Determine value color — warn takes precedence over highlight
  const valueColor = warn
    ? "text-red-600"
    : highlight
    ? "text-eco-700"
    : "text-stone-900";

  // Card border tint for warn state — subtle visual cue without being alarming
  const borderColor = warn ? "border-amber-300" : "border-stone-200";

  const displayValue = value === null || value === undefined ? "—" : value;

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-white p-4 ${className}`.trim()}
    >
      <p className="text-xs font-medium text-stone-500 truncate">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        {icon && (
          <span className="shrink-0 text-stone-400" aria-hidden="true">
            {icon}
          </span>
        )}
        <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>
          {displayValue}
        </p>
      </div>
      {supporting && (
        <p className="mt-1 text-xs text-stone-400 truncate">{supporting}</p>
      )}
    </div>
  );
}

export default StatCard;
