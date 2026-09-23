"use client";

/**
 * PickupTimeline — EcoTrack Design System
 *
 * Visual step-by-step progression of a pickup's status through the
 * backend state machine:
 *
 *   REQUESTED → ASSIGNED → EN_ROUTE → ARRIVED → COLLECTED
 *
 * Terminal failure states (FAILED, MISSED, CANCELLED) are shown as a
 * distinct "stopped here" state rather than a forward progression.
 *
 * Accessibility:
 * - Each step has a visible text label (not icon-only)
 * - aria-label on the list describes the current status in prose
 * - aria-current="step" on the active step
 * - Color is supplementary — shape/text also differentiates states
 *
 * Usage:
 *   <PickupTimeline status="EN_ROUTE" />
 *   <PickupTimeline status="COLLECTED" />   // all steps filled
 *   <PickupTimeline status="FAILED" />      // terminal failure display
 */

import type { ReactNode } from "react";

// The ordered progression steps shown in the timeline.
// ASSIGNED is shown once the collector is assigned, not a separate step.
const STEPS: { status: string; label: string }[] = [
  { status: "REQUESTED", label: "Requested" },
  { status: "ASSIGNED",  label: "Assigned" },
  { status: "EN_ROUTE",  label: "En route" },
  { status: "ARRIVED",   label: "Arrived" },
  { status: "COLLECTED", label: "Collected" },
];

// Statuses that represent a terminal failure — shown differently from the
// normal progression. These stop the timeline at the last reached step.
const TERMINAL_FAILURE = new Set(["FAILED", "MISSED", "CANCELLED"]);

/** Returns the index of a status in the ordered STEPS array, or -1. */
function stepIndex(status: string): number {
  return STEPS.findIndex((s) => s.status === status);
}

interface PickupTimelineProps {
  /** The pickup's current status string from the backend */
  status: string;
  /** Extra Tailwind classes for the outer container */
  className?: string;
}

export function PickupTimeline({ status, className = "" }: PickupTimelineProps): ReactNode {
  const isTerminalFailure = TERMINAL_FAILURE.has(status);
  const currentIdx = isTerminalFailure
    ? -1                        // none of the steps is "current" — it failed
    : stepIndex(status);

  // Determine which step is the last "reached" one before failure.
  // For normal statuses, every step at or before currentIdx is "done".
  // For terminal failures we can't reliably determine how far it got from
  // status alone (FAILED could happen after ARRIVED or after ASSIGNED),
  // so we show all steps as incomplete and display the failure label.
  const reachedIdx = isTerminalFailure ? -1 : currentIdx;

  // Human-readable description for screen readers
  const ariaLabel = isTerminalFailure
    ? `Pickup ${status.toLowerCase().replace("_", " ")} — collection did not complete`
    : `Pickup progress: currently ${STEPS[currentIdx]?.label ?? status}`;

  return (
    <div className={className}>
      <ol
        aria-label={ariaLabel}
        className="flex items-start gap-0"
      >
        {STEPS.map((step, idx) => {
          const isDone    = idx < reachedIdx;
          const isCurrent = idx === reachedIdx && !isTerminalFailure;
          const isFuture  = idx > reachedIdx && !isTerminalFailure;
          const isLast    = idx === STEPS.length - 1;

          return (
            <li
              key={step.status}
              className="flex flex-1 flex-col items-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Step connector row: dot + line */}
              <div className="flex w-full items-center">
                {/* Left connecting line (hidden for first step) */}
                <div
                  className={`h-0.5 flex-1 ${idx === 0 ? "invisible" : isDone || isCurrent ? "bg-eco-700" : "bg-stone-200"}`}
                  aria-hidden="true"
                />

                {/* Step dot */}
                <div
                  aria-hidden="true"
                  className={`
                    flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                    text-xs font-bold ring-2
                    ${isDone
                      ? "bg-eco-700 text-white ring-eco-700"
                      : isCurrent
                      ? "bg-eco-900 text-white ring-eco-900 ring-offset-2"
                      : isTerminalFailure
                      ? "bg-stone-100 text-stone-400 ring-stone-200"
                      : isFuture
                      ? "bg-white text-stone-400 ring-stone-200"
                      : "bg-white text-stone-400 ring-stone-200"}
                  `.trim().replace(/\s+/g, " ")}
                >
                  {isDone ? (
                    /* Checkmark for completed steps */
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    /* Step number */
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Right connecting line (hidden for last step) */}
                <div
                  className={`h-0.5 flex-1 ${isLast ? "invisible" : isDone ? "bg-eco-700" : "bg-stone-200"}`}
                  aria-hidden="true"
                />
              </div>

              {/* Step label */}
              <span
                className={`
                  mt-1.5 text-center text-[10px] font-medium leading-tight
                  ${isDone      ? "text-eco-700"
                  : isCurrent   ? "text-eco-900"
                  : isTerminalFailure ? "text-stone-400"
                  : "text-stone-400"}
                `.trim().replace(/\s+/g, " ")}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Terminal failure banner — shown below the steps */}
      {isTerminalFailure && (
        <p
          className={`
            mt-2 rounded-md px-3 py-1.5 text-center text-xs font-semibold
            ${status === "CANCELLED"
              ? "bg-stone-100 text-stone-600"
              : "bg-red-50 text-red-700"}
          `.trim().replace(/\s+/g, " ")}
          role="status"
        >
          {status === "CANCELLED"
            ? "This pickup was cancelled"
            : status === "MISSED"
            ? "Collection was missed"
            : "Collection could not be completed"}
        </p>
      )}
    </div>
  );
}

export default PickupTimeline;
