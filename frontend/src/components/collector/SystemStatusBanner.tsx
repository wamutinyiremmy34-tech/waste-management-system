import type { ReactNode } from "react";
import type { QueuedAction } from "./types";

interface SystemStatusBannerProps {
  isOnline: boolean;
  pending: QueuedAction[];
  syncing: boolean;
  conflicted: QueuedAction[];
}

export function SystemStatusBanner({
  isOnline,
  pending,
  syncing,
  conflicted,
}: SystemStatusBannerProps): ReactNode {
  const count = pending.length;
  const conflictCount = conflicted.length;

  return (
    <div className="w-full space-y-1">
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white"
        >
          You&apos;re offline. Actions will be saved on this device and synced automatically
          when you&apos;re back online.
        </div>
      )}
      {isOnline && syncing && (
        <div
          role="status"
          aria-live="polite"
          className="bg-blue-500 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Syncing {count} saved action{count === 1 ? "" : "s"}…
        </div>
      )}
      {isOnline && !syncing && conflictCount > 0 && (
        <div
          role="alert"
          className="bg-red-500 px-4 py-2 text-center text-sm font-medium text-white"
        >
          {conflictCount} saved action{conflictCount === 1 ? "" : "s"} could not be synced —
          see details below.
        </div>
      )}
    </div>
  );
}

export default SystemStatusBanner;
