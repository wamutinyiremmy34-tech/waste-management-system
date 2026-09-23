/**
 * StatusBadge — EcoTrack Design System
 *
 * Single source of truth for all status/priority badge colors.
 * Replaces the duplicated STATUS_COLORS records scattered across
 * dashboard/page.tsx, collector/page.tsx, and admin/page.tsx.
 *
 * Usage:
 *   <StatusBadge status="COLLECTED" />
 *   <StatusBadge status="HIGH" variant="priority" />
 *   <StatusBadge status="REPORTED" variant="complaint" />
 *
 * Screen-reader note: the badge renders visible text (the status label),
 * so no aria-label is needed. Color is supplementary, not the sole indicator.
 */

import type { ReactNode } from "react";

// ─── Pickup / collection statuses ────────────────────────────────────────────
export type PickupStatus =
  | "REQUESTED"
  | "ASSIGNED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "COLLECTED"
  | "FAILED"
  | "MISSED"
  | "CANCELLED";

// ─── Priority levels ──────────────────────────────────────────────────────────
export type PriorityLevel = "HIGH" | "MEDIUM" | "LOW";

// ─── Complaint statuses ───────────────────────────────────────────────────────
export type ComplaintStatus =
  | "REPORTED"
  | "UNDER_REVIEW"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "REJECTED";

// ─── Vehicle statuses ─────────────────────────────────────────────────────────
export type VehicleStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_SERVICE"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE";

export type BadgeVariant = "pickup" | "priority" | "complaint" | "vehicle" | "generic";

// Union of every value that can be badged across the app
export type BadgeStatus =
  | PickupStatus
  | PriorityLevel
  | ComplaintStatus
  | VehicleStatus
  | string; // fallback for unknown values — renders stone-200/600

// ─── Color map ────────────────────────────────────────────────────────────────
// Values intentionally match the existing STATUS_COLORS records so the visual
// output is pixel-identical — we are systematizing, not redesigning.
const COLOR_MAP: Record<string, string> = {
  // Pickup statuses
  REQUESTED:    "bg-amber-100 text-amber-800",
  ASSIGNED:     "bg-blue-100 text-blue-800",
  EN_ROUTE:     "bg-blue-100 text-blue-800",
  ARRIVED:      "bg-blue-100 text-blue-800",
  COLLECTED:    "bg-emerald-100 text-emerald-800",
  FAILED:       "bg-red-100 text-red-800",
  MISSED:       "bg-red-100 text-red-800",
  CANCELLED:    "bg-stone-200 text-stone-600",

  // Priority levels
  HIGH:         "bg-red-100 text-red-800",
  MEDIUM:       "bg-amber-100 text-amber-800",
  LOW:          "bg-stone-100 text-stone-700",

  // Complaint statuses
  REPORTED:     "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS:  "bg-blue-100 text-blue-800",
  RESOLVED:     "bg-emerald-100 text-emerald-800",
  REJECTED:     "bg-stone-200 text-stone-600",

  // Vehicle statuses
  AVAILABLE:    "bg-emerald-100 text-emerald-800",
  IN_SERVICE:   "bg-blue-100 text-blue-800",
  MAINTENANCE:  "bg-amber-100 text-amber-800",
  OUT_OF_SERVICE: "bg-red-100 text-red-800",
};

// Human-readable display labels — converts SNAKE_CASE to Title Case
function toLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface StatusBadgeProps {
  /** The status/priority value to display */
  status: BadgeStatus;
  /**
   * Optional override label. If omitted, the status string is
   * automatically converted: EN_ROUTE → "En Route".
   */
  label?: string;
  /** Additional Tailwind classes for size/spacing overrides */
  className?: string;
  /** Accessible role — defaults to none (inline text) */
  role?: string;
  /** For screen-readers: supplement the label if context is ambiguous */
  "aria-label"?: string;
}

export function StatusBadge({
  status,
  label,
  className = "",
  ...ariaProps
}: StatusBadgeProps): ReactNode {
  const colorClasses = COLOR_MAP[status] ?? "bg-stone-200 text-stone-600";
  const displayLabel = label ?? toLabel(String(status));

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${colorClasses} ${className}`.trim()}
      {...ariaProps}
    >
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
