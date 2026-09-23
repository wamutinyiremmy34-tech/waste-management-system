/**
 * ErrorState — EcoTrack Design System
 *
 * Replaces the bare `<p className="... text-red-600">{error}</p>` inline
 * error messages scattered across all pages. Provides a structured,
 * accessible error presentation.
 *
 * Two variants:
 *   "inline"  — red banner within a section (matches existing red-50/red-600
 *               boxes used in forms and action errors — default)
 *   "page"    — centered full-page error (for load failures)
 *
 * Usage:
 *   // Inline action error (matches existing pattern)
 *   {error && <ErrorState message={error} />}
 *
 *   // With a retry button
 *   {loadError && (
 *     <ErrorState
 *       title="Could not load pickups"
 *       message={loadError}
 *       onRetry={refresh}
 *     />
 *   )}
 *
 *   // Full page load failure
 *   <ErrorState variant="page" title="Something went wrong" message={error} onRetry={retry} />
 */

import type { ReactNode } from "react";

/** Minimal inline warning/exclamation SVG — no external dependency */
function AlertIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface ErrorStateProps {
  variant?: "inline" | "page";
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  variant = "inline",
  title,
  message,
  onRetry,
  className = "",
}: ErrorStateProps): ReactNode {
  if (variant === "page") {
    return (
      <main
        className={`flex flex-1 items-center justify-center p-8 ${className}`.trim()}
        role="alert"
      >
        <div className="mx-auto max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertIcon className="h-6 w-6" />
          </div>
          {title && (
            <h2 className="mb-1 text-base font-semibold text-stone-900">
              {title}
            </h2>
          )}
          <p className="text-sm text-stone-600">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-md bg-eco-900 px-4 py-2 text-sm font-semibold text-white hover:bg-eco-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-700"
            >
              Try again
            </button>
          )}
        </div>
      </main>
    );
  }

  // "inline" variant — matches the existing rounded-md bg-red-50 p-3 pattern
  return (
    <div
      className={`flex items-start gap-2 rounded-md bg-red-50 p-3 ${className}`.trim()}
      role="alert"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
      <div className="min-w-0">
        {title && (
          <p className="text-sm font-semibold text-red-700">{title}</p>
        )}
        <p className="text-sm text-red-600">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 text-xs font-semibold text-red-700 underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
