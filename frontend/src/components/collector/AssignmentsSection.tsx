import * as React from "react";
import { useState } from "react";
import { api, ApiError, PickupOut } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { SkeletonCard } from "@/components/ui/SkeletonCard";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import type { LocationState, QueuedAction, RouteStop } from "./types";

const NEXT_STATUS: Record<string, string> = {
  ASSIGNED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
};

const NEXT_LABEL: Record<string, string> = {
  ASSIGNED: "Start route",
  EN_ROUTE: "Mark arrived",
};

interface AssignmentsSectionProps {
  token: string;
  /** All assigned pickups returned from the API (includes terminal) */
  pickups: PickupOut[];
  /** Loading indicator for the initial assignments fetch */
  dataLoading: boolean;
  /** Route order: pickup IDs ordered by sequence (or empty if route unavailable) */
  routeOrder: string[];
  /** Whether route came after a fresh collector location check-in */
  routeFresh: boolean;
  /** Current state of the Start-route workflow */
  locationState: LocationState;
  /** Error from the last user-initiated action (for inline banner) */
  actionError: string | null;
  /** Offline queue actions currently queued or errored */
  pending: QueuedAction[];
  /** Called after a successful online operation to re-pull server state */
  onOnlineSuccess: () => void;
}

function isQueued(pickupId: string, pending: QueuedAction[]): boolean {
  return pending.some((a) => a.pickupId === pickupId);
}

function sortByRoute(
  pickups: PickupOut[],
  routeOrder: string[]
): { pickup: PickupOut; stopIndex: number | null }[] {
  const items = pickups.map<PickupOut & { __routeIndex: number }>((p) => {
    const ri = routeOrder.length > 0 ? routeOrder.indexOf(p.id) : -1;
    return { ...p, __routeIndex: ri };
  });
  if (routeOrder.length > 0) {
    items.sort((a, b) => {
      const ia = a.__routeIndex;
      const ib = b.__routeIndex;
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return items.map((p) => ({
    pickup: p,
    stopIndex: p.__routeIndex >= 0 ? p.__routeIndex + 1 : null,
  }));
}

export function AssignmentsSection({
  token,
  pickups,
  dataLoading,
  routeOrder,
  routeFresh,
  actionError,
  pending,
  onOnlineSuccess,
}: AssignmentsSectionProps): React.ReactNode {
  const conflicted = pending.filter((a) => a.lastError);
  const { queueOrSend } = useOfflineQueue(token);

  const [completing, setCompleting] = React.useState<string | null>(null);
  const [failing, setFailing] = React.useState<string | null>(null);
  const [quantity, setQuantity] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [failureReason, setFailureReason] = React.useState("");
  const [actionRunningId, setActionRunningId] = React.useState<string | null>(null);
  const [localActionError, setLocalActionError] = useState<string | null>(actionError ?? null);

  React.useEffect(() => {
    setLocalActionError(actionError);
  }, [actionError]);

  const activePickups = pickups.filter(
    (p) => p.status !== "COLLECTED" && p.status !== "FAILED" && p.status !== "CANCELLED"
  );
  const completedToday = pickups.filter(
    (p) => p.status === "COLLECTED" || p.status === "FAILED"
  );

  async function advanceStatus(pickupId: string, current: string) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    setActionRunningId(pickupId);
    setLocalActionError(null);
    try {
      await queueOrSend("status_update", pickupId, { status: next }, () =>
        api.updatePickupStatus(token, pickupId, next).then(() => undefined)
      );
      if (typeof navigator !== "undefined" && navigator.onLine) onOnlineSuccess();
    } catch (err) {
      setLocalActionError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setActionRunningId(null);
    }
  }

  async function submitCompletion(pickupId: string) {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setLocalActionError("Enter a valid weight in kg.");
      return;
    }
    setActionRunningId(pickupId);
    setLocalActionError(null);
    try {
      await queueOrSend(
        "complete_collection",
        pickupId,
        { quantity_kg: qty, completion_notes: notes || undefined },
        () =>
          api
            .completeCollection(token, pickupId, {
              quantity_kg: qty,
              completion_notes: notes || undefined,
            })
            .then(() => undefined)
      );
      setCompleting(null);
      setQuantity("");
      setNotes("");
      if (typeof navigator !== "undefined" && navigator.onLine) onOnlineSuccess();
    } catch (err) {
      setLocalActionError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setActionRunningId(null);
    }
  }

  async function reportFailure(pickupId: string) {
    if (!failureReason.trim()) {
      setLocalActionError("Please enter a reason for the failure.");
      return;
    }
    setActionRunningId(pickupId);
    setLocalActionError(null);
    try {
      await queueOrSend("fail_collection", pickupId, { failure_reason: failureReason }, () =>
        api.failCollection(token, pickupId, failureReason).then(() => undefined)
      );
      setFailing(null);
      setFailureReason("");
      if (typeof navigator !== "undefined" && navigator.onLine) onOnlineSuccess();
    } catch (err) {
      setLocalActionError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setActionRunningId(null);
    }
  }

  const sortedActive = sortByRoute(activePickups, routeOrder);

  return (
    <div className="space-y-4">
      {conflicted.length > 0 && (
        <div className="space-y-2" role="alert">
          {conflicted.map((a) => (
            <div
              key={a.id}
              className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <p className="font-medium">
                Could not sync a {a.type.replace("_", " ")} action
              </p>
              {a.lastError && <p className="text-xs opacity-80">{a.lastError}</p>}
            </div>
          ))}
        </div>
      )}

      {localActionError && (
        <ErrorState variant="inline" message={localActionError} />
      )}

      <div>
        <h2 className="mb-1 text-lg font-semibold text-stone-900">Your assignments</h2>
        {routeOrder.length > 0 && activePickups.length > 0 && (
          <p className="mb-3 text-xs text-stone-500">
            {routeFresh
              ? "✓ Ordered by nearest-neighbour route from your current location."
              : "Ordered by nearest-neighbour route (cached location). Tap 'Start route' to refresh."}
          </p>
        )}
      </div>

      {dataLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SkeletonCard variant="row" />
            <SkeletonCard variant="row" />
          </div>
          <div className="text-right">
            <LoadingState message="Loading assignments…" />
          </div>
        </div>
      )}

      {!dataLoading && pickups.length === 0 && (
        <EmptyState
          title="No pickups assigned"
          description="Your shift hasn't started yet, or your dispatcher hasn't assigned today's route. Check back shortly or contact your supervisor."
        />
      )}

      {!dataLoading && activePickups.length === 0 && pickups.length > 0 && (
        <EmptyState
          title="All pickups complete"
          description="Great job! You've finished every assignment for this shift. Head back to base or wait for your supervisor to add more."
        />
      )}

      {!dataLoading && sortedActive.length > 0 && (
        <ol className="space-y-3" role="list">
          {sortedActive.map(({ pickup: p, stopIndex }) => {
            const isRunning = actionRunningId === p.id;
            const completingOpen = completing === p.id;
            const failingOpen = failing === p.id;
            return (
              <li
                key={p.id}
                className="rounded-lg border border-stone-200 bg-white p-4"
              >
                <article className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {stopIndex !== null && (
                      <span
                        className="mb-1 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600"
                        aria-label={`Stop ${stopIndex} of ${routeOrder.length}`}
                      >
                        Stop {stopIndex}
                      </span>
                    )}
                    <p className="font-medium text-stone-900">{p.waste_category}</p>
                    <p className="text-sm text-stone-500">
                      {p.address_text ||
                        `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}
                    </p>
                    {p.notes && (
                      <p className="mt-1 text-xs italic text-stone-500">
                        &ldquo;{p.notes}&rdquo;
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={p.status} />
                    {isQueued(p.id, pending) && (
                      <span
                        title="Action saved on this device and will sync when online."
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                      >
                        Pending sync
                      </span>
                    )}
                  </div>
                </article>

                {(p.status === "ASSIGNED" || p.status === "EN_ROUTE") &&
                  !completingOpen &&
                  !failingOpen && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={isRunning}
                        onClick={() => advanceStatus(p.id, p.status)}
                        aria-label={`${NEXT_LABEL[p.status]} for ${p.waste_category}`}
                      >
                        {NEXT_LABEL[p.status]}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isRunning}
                        onClick={() => {
                          setFailing(p.id);
                          setFailureReason("");
                          setCompleting(null);
                        }}
                      >
                        Report failed
                      </Button>
                    </div>
                  )}

                {p.status === "ARRIVED" && !completingOpen && !failingOpen && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      loading={isRunning}
                      onClick={() => {
                        setCompleting(p.id);
                        setFailing(null);
                      }}
                    >
                      Complete collection
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isRunning}
                      onClick={() => {
                        setFailing(p.id);
                        setFailureReason("");
                        setCompleting(null);
                      }}
                    >
                      Report failed
                    </Button>
                  </div>
                )}

                {failingOpen && (
                  <div className="mt-3 space-y-2 rounded-md bg-red-50 p-3">
                    <div>
                      <label
                        htmlFor={`fail-reason-${p.id}`}
                        className="block text-xs font-medium text-stone-700"
                      >
                        Reason the collection failed
                      </label>
                      <input
                        id={`fail-reason-${p.id}`}
                        value={failureReason}
                        onChange={(e) => setFailureReason(e.target.value)}
                        placeholder="e.g. Access road blocked, customer not home"
                        className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={isRunning}
                        onClick={() => reportFailure(p.id)}
                      >
                        Submit failure
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFailing(null);
                          setFailureReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {completingOpen && (
                  <div className="mt-3 space-y-2 rounded-md bg-emerald-50 p-3">
                    <div>
                      <label
                        htmlFor={`complete-qty-${p.id}`}
                        className="block text-xs font-medium text-stone-700"
                      >
                        Weight collected (kg)
                      </label>
                      <input
                        id={`complete-qty-${p.id}`}
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`complete-notes-${p.id}`}
                        className="block text-xs font-medium text-stone-700"
                      >
                        Notes (optional)
                      </label>
                      <input
                        id={`complete-notes-${p.id}`}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        loading={isRunning}
                        onClick={() => submitCompletion(p.id)}
                      >
                        Submit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCompleting(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {completedToday.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-stone-500">
            Completed / failed today
          </h3>
          <ul className="space-y-2">
            {completedToday.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-stone-100 bg-white px-4 py-2"
              >
                <p className="min-w-0 truncate text-sm text-stone-600">
                  {p.waste_category} ·{" "}
                  {p.address_text ||
                    `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}
                </p>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default AssignmentsSection;
