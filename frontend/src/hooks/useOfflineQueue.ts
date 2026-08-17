"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  QueuedAction,
  enqueueAction,
  listQueuedActions,
  removeQueuedAction,
  updateQueuedActionError,
} from "@/lib/offlineQueue";

/**
 * Replays one queued action against the real API. Returns null on success,
 * or an error message on failure. A 4xx from the server (e.g. the pickup
 * was reassigned/cancelled/already completed while this device was offline)
 * is treated as a genuine conflict — not retried, surfaced to the user —
 * while a network failure leaves the action queued for the next attempt.
 */
async function replayAction(token: string, action: QueuedAction): Promise<string | null> {
  try {
    if (action.type === "status_update") {
      await api.updatePickupStatus(token, action.pickupId, action.payload.status as string);
    } else if (action.type === "complete_collection") {
      await api.completeCollection(token, action.pickupId, action.payload as { quantity_kg: number });
    } else if (action.type === "fail_collection") {
      await api.failCollection(token, action.pickupId, action.payload.failure_reason as string);
    }
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      // Genuine conflict (e.g. 422 illegal transition because the pickup's
      // state moved on while offline, or 403 because it was reassigned) —
      // don't retry forever, surface it instead.
      return err.message;
    }
    // Network error or 5xx — leave queued, try again on the next flush.
    throw err;
  }
}

export function useOfflineQueue(token: string | null) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pending, setPending] = useState<QueuedAction[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    try {
      const actions = await listQueuedActions();
      setPending(actions);
    } catch {
      // IndexedDB unavailable (e.g. private browsing in some browsers) —
      // the queue simply won't persist; actions will fail immediately
      // instead of queuing, which is a reasonable degradation.
    }
  }, []);

  const flush = useCallback(async () => {
    if (!token || syncing) return;
    setSyncing(true);
    try {
      const actions = await listQueuedActions();
      for (const action of actions.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
        try {
          const conflictError = await replayAction(token, action);
          if (conflictError) {
            await updateQueuedActionError(action.id, conflictError);
          } else {
            await removeQueuedAction(action.id);
          }
        } catch {
          // Network/server error — stop flushing for now, leave the rest queued.
          break;
        }
      }
    } finally {
      await refreshPending();
      setSyncing(false);
    }
  }, [token, syncing, refreshPending]);

  useEffect(() => {
    // isOnline is initialized lazily above from navigator.onLine directly, so
    // this effect only needs to load any actions persisted from a previous
    // session — not re-derive online status synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial IndexedDB load on mount, same justified pattern used elsewhere in this codebase (AuthContext, dashboard pages)
    refreshPending();

    function handleOnline() {
      setIsOnline(true);
      flush();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush, refreshPending]);

  // Attempt a flush whenever we have a token and pending items and are online
  // (e.g. right after login, or after the queue gains an item while online).
  // This is a genuine external-system sync trigger (a network replay of
  // queued writes on reconnect), not derived render state, so a justified
  // suppression is appropriate here rather than restructuring away the effect.
  useEffect(() => {
    if (isOnline && token && pending.length > 0 && !syncing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- flush() syncs queued writes to the server on reconnect; this is external-system synchronization, not derived UI state
      flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, token, pending.length]);

  const queueOrSend = useCallback(
    async (type: QueuedAction["type"], pickupId: string, payload: Record<string, unknown>, sendNow: () => Promise<void>) => {
      if (navigator.onLine) {
        try {
          await sendNow();
          return;
        } catch (err) {
          if (!(err instanceof ApiError)) {
            // Network error even though navigator.onLine said we're online
            // (flaky connection) — fall through to queuing instead of losing the action.
          } else {
            throw err; // A real API error (validation, conflict, auth) — surface it immediately.
          }
        }
      }
      await enqueueAction({ type, pickupId, payload });
      await refreshPending();
    },
    [refreshPending]
  );

  return { isOnline, pending, syncing, flush, queueOrSend };
}
