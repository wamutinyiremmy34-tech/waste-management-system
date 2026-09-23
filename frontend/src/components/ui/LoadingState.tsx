/**
 * LoadingState — EcoTrack Design System
 *
 * Replaces the bare `<p className="text-sm text-stone-400">Loading...</p>`
 * and `<main className="flex-1 p-8 text-stone-500">Loading...</main>`
 * patterns currently used on every page.
 *
 * Two variants:
 *   - "spinner"  — animated ring, good for inline/section loading
 *   - "page"     — full page centered loading, replaces the main-element pattern
 *
 * Usage:
 *   <LoadingState />                          // spinner, default message
 *   <LoadingState message="Loading pickups…" />
 *   <LoadingState variant="page" />           // full page
 *   <LoadingState variant="page" message="Signing you in…" />
 */

import type { ReactNode } from "react";

interface LoadingStateProps {
  variant?: "spinner" | "page";
  message?: string;
  className?: string;
}

/** The spinner SVG — inline so there is no external asset dependency */
function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-eco-700 ${className}`}
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

export function LoadingState({
  variant = "spinner",
  message = "Loading…",
  className = "",
}: LoadingStateProps): ReactNode {
  if (variant === "page") {
    return (
      <main
        className={`flex flex-1 items-center justify-center p-8 ${className}`.trim()}
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-stone-500">{message}</p>
        </div>
      </main>
    );
  }

  // "spinner" variant — inline, suitable inside a section
  return (
    <div
      className={`flex items-center gap-2 py-2 ${className}`.trim()}
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner />
      <p className="text-sm text-stone-400">{message}</p>
    </div>
  );
}

export default LoadingState;
