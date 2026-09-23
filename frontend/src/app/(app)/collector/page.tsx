"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError, PickupOut } from "@/lib/api";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-blue-100 text-blue-800",
  EN_ROUTE: "bg-amber-100 text-amber-800",
  ARRIVED: "bg-amber-100 text-amber-800",
  COLLECTED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
};

const NEXT_STATUS: Record<string, string> = {
  ASSIGNED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
};

const NEXT_LABEL: Record<string, string> = {
  ASSIGNED: "Start route",
  EN_ROUTE: "Mark arrived",
};

export default function CollectorPage() {
  const { token, user, loading } = useAuth();
  const router = useRouter();
  const [pickups, setPickups] = useState<PickupOut[]>([]);
  const [routeOrder, setRouteOrder] = useState<string[]>([]);  // ordered pickup IDs from optimizer
  const [dataLoading, setDataLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [failing, setFailing] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [failureReason, setFailureReason] = useState("");

  // Phase 3 — Start Route location workflow
  const [locationState, setLocationState] = useState<
    "idle" | "requesting" | "updating" | "done" | "denied" | "unavailable" | "timeout" | "offline" | "error"
  >("idle");
  const [routeFresh, setRouteFresh] = useState(false); // true = route was obtained after a fresh location check-in

  const { isOnline, pending, syncing, queueOrSend } = useOfflineQueue(token);

  // Guard: only re-fetch after a real sync cycle, not on the initial render
  // where syncing===false and pending===[] is also true before any sync runs.
  const hasSyncedOnceRef = useRef(false);

  const refresh = useCallback(() => {
    if (!token) return;
    setDataLoading(true);
    api
      .assignedPickups(token)
      .catch(() => ({ items: [] as PickupOut[], total: 0 }))
      .then((res) => setPickups(res.items))
      .finally(() => setDataLoading(false));

    api
      .myCollectorProfile(token)
      .catch(() => null)
      .then((profile) =>
        profile ? api.optimizedRoute(token, profile.id).catch(() => null) : null
      )
      .then((route) => {
        if (route) setRouteOrder(route.stops.map((s) => s.pickup_id));
      });
  }, [token]);
  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user && user.role !== "COLLECTOR") {
      router.replace("/dashboard");
    }
  }, [loading, token, user, router]);

  useEffect(() => {
    if (!loading && token && user?.role === "COLLECTOR") {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token, user]);

  // Re-pull the assignment list once a sync finishes, so completed/queued
  // actions that just landed on the server show up with their real status.
  // hasSyncedOnceRef prevents the spurious fire at startup (when syncing===false
  // and pending===[] before any sync has ever occurred).
  useEffect(() => {
    if (syncing) {
      hasSyncedOnceRef.current = true;
      return;
    }
    if (hasSyncedOnceRef.current && pending.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch after a sync completes
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing]);

  function isPickupQueued(pickupId: string): boolean {
    return pending.some((a) => a.pickupId === pickupId);
  }

  async function advanceStatus(pickupId: string, current: string) {
    if (!token) return;
    const next = NEXT_STATUS[current];
    if (!next) return;
    setActionError(null);
    try {
      await queueOrSend("status_update", pickupId, { status: next }, () =>
        api.updatePickupStatus(token, pickupId, next).then(() => undefined)
      );
      if (navigator.onLine) refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function submitCompletion(pickupId: string) {
    if (!token) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setActionError("Enter a valid weight in kg.");
      return;
    }
    setActionError(null);
    try {
      await queueOrSend(
        "complete_collection",
        pickupId,
        { quantity_kg: qty, completion_notes: notes || undefined },
        () => api.completeCollection(token, pickupId, { quantity_kg: qty, completion_notes: notes || undefined }).then(() => undefined)
      );
      setCompleting(null);
      setQuantity("");
      setNotes("");
      if (navigator.onLine) refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  async function reportFailure(pickupId: string) {
    if (!token) return;
    if (!failureReason.trim()) {
      setActionError("Please enter a reason for the failure.");
      return;
    }
    setActionError(null);
    try {
      await queueOrSend("fail_collection", pickupId, { failure_reason: failureReason }, () =>
        api.failCollection(token, pickupId, failureReason).then(() => undefined)
      );
      setFailing(null);
      setFailureReason("");
      if (navigator.onLine) refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  /**
   * Start Route workflow (Phase 3):
   * 1. Request geolocation permission (one-shot, not continuous tracking)
   * 2. On success: PATCH /collectors/me/location, then re-fetch optimised route
   * 3. On denial / timeout / unsupported / offline: inform user, fall back to
   *    cached pickups without blocking the workflow
   *
   * Security: location is sent only to the collector's own profile endpoint.
   * No platform-wide location broadcast.
   */
  async function startRoute() {
    if (!token) return;

    if (!navigator.onLine) {
      setLocationState("offline");
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocationState("unavailable");
      refresh();
      return;
    }

    setLocationState("requesting");

    const GEO_TIMEOUT_MS = 10_000;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocationState("updating");
        try {
          const locPromise = api.updateCollectorLocation(token, latitude, longitude);
          const profilePromise = api.myCollectorProfile(token).catch(() => null);
          const pickupsPromise = api.assignedPickups(token).catch(() => ({ items: [] as PickupOut[], total: 0 }));
          await locPromise;
          setRouteFresh(true);
          setLocationState("done");
          const [profile, pickupsRes] = await Promise.all([profilePromise, pickupsPromise]);
          setPickups(pickupsRes.items);
          if (profile) {
            api
              .optimizedRoute(token, profile.id)
              .catch(() => null)
              .then((route) => {
                if (route) setRouteOrder(route.stops.map((s) => s.pickup_id));
              });
          }
        } catch {
          setLocationState("error");
          refresh();
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationState("denied");
        } else if (err.code === err.TIMEOUT) {
          setLocationState("timeout");
        } else {
          setLocationState("unavailable");
        }
        refresh();
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: 60_000, enableHighAccuracy: false }
    );
  }

  if (loading || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-stone-500">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
          <p className="text-sm">Loading collector dashboard…</p>
        </div>
      </main>
    );
  }

  const activePickups = pickups.filter((p) => p.status !== "COLLECTED" && p.status !== "FAILED");
  const doneToday = pickups.filter((p) => p.status === "COLLECTED").length;
  const conflicted = pending.filter((a) => a.lastError);

  // Sort active pickups by optimized route order if available
  const sortedActive = routeOrder.length > 0
    ? [...activePickups].sort((a, b) => {
        const ia = routeOrder.indexOf(a.id);
        const ib = routeOrder.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : activePickups;

  return (
    <div className="bg-stone-50">
      {/* Offline/sync status banners — functional, kept at top of content */}
      {!isOnline && (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
          You&apos;re offline. Actions will be saved on this device and synced automatically when
          you&apos;re back online.
        </div>
      )}
      {isOnline && syncing && (
        <div className="bg-blue-500 px-4 py-2 text-center text-sm font-medium text-white">
          Syncing {pending.length} saved action(s)...
        </div>
      )}
      {isOnline && !syncing && conflicted.length > 0 && (
        <div className="bg-red-500 px-4 py-2 text-center text-sm font-medium text-white">
          {conflicted.length} saved action(s) could not be synced — see details below.
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <p className="text-sm text-stone-500">Active jobs</p>
            <p className="text-2xl font-bold text-stone-900">{activePickups.length}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <p className="text-sm text-stone-500">Completed today</p>
            <p className="text-2xl font-bold text-emerald-700">{doneToday}</p>
          </div>
        </div>

        {/* ── Start Route workflow (Phase 3) ── */}
        {locationState === "idle" && activePickups.length > 0 && (
          <button
            onClick={startRoute}
            className="mb-5 w-full rounded-lg bg-[#1b4332] px-4 py-3 text-sm font-semibold text-white shadow hover:bg-[#2d6a4f] active:scale-[.98] transition-transform"
          >
            📍 Start route — check in my location
          </button>
        )}
        {locationState === "requesting" && (
          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Requesting location permission…
          </div>
        )}
        {locationState === "updating" && (
          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Updating your location…
          </div>
        )}
        {locationState === "done" && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            ✓ Location checked in. Route optimised from your current position.
          </div>
        )}
        {locationState === "denied" && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Location permission denied. Showing pickups in default order.
            Your browser or device settings blocked location access.
          </div>
        )}
        {locationState === "timeout" && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Location timed out. Showing pickups in default order. Try again when you have a clear GPS signal.
          </div>
        )}
        {locationState === "unavailable" && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Location not available on this device. Showing pickups in default order.
          </div>
        )}
        {locationState === "offline" && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You&apos;re offline. Location check-in skipped — using cached pickups.
          </div>
        )}
        {locationState === "error" && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not send your location. Showing pickups in default order.
          </div>
        )}

        {actionError && (
          <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{actionError}</p>
        )}

        {conflicted.length > 0 && (
          <div className="mb-4 space-y-2">
            {conflicted.map((a) => (
              <div key={a.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">Could not sync a {a.type.replace("_", " ")} action</p>
                <p className="text-xs">{a.lastError}</p>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-3 text-lg font-semibold text-stone-900">Your assignments</h2>
        {routeOrder.length > 0 && (
          <p className="mb-3 text-xs text-stone-400">
            {routeFresh
              ? "✓ Ordered by nearest-neighbour route from your current location."
              : "Ordered by nearest-neighbour route (cached location). Tap 'Start route' to refresh."}
          </p>
        )}

        {dataLoading && <p className="text-sm text-stone-400">Loading...</p>}
        {!dataLoading && pickups.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No pickups assigned to you yet.
          </p>
        )}

        <div className="space-y-3">
          {sortedActive.map((p, idx) => (
            <div key={p.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  {routeOrder.length > 0 && (
                    <span className="mb-1 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600">
                      Stop {idx + 1}
                    </span>
                  )}
                  <p className="font-medium text-stone-900">{p.waste_category}</p>
                  <p className="text-sm text-stone-500">{p.address_text || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}</p>
                  {p.notes && <p className="mt-1 text-xs text-stone-400">&ldquo;{p.notes}&rdquo;</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[p.status] || "bg-stone-100 text-stone-700"}`}>
                    {p.status.replace("_", " ")}
                  </span>
                  {isPickupQueued(p.id) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Pending sync
                    </span>
                  )}
                </div>
              </div>

              {(p.status === "ASSIGNED" || p.status === "EN_ROUTE") && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => advanceStatus(p.id, p.status)}
                    className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f]"
                  >
                    {NEXT_LABEL[p.status]}
                  </button>
                  <button
                    onClick={() => { setFailing(p.id); setFailureReason(""); setCompleting(null); }}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Report failed
                  </button>
                </div>
              )}

              {p.status === "ARRIVED" && completing !== p.id && failing !== p.id && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => { setCompleting(p.id); setFailing(null); }}
                    className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f]"
                  >
                    Complete collection
                  </button>
                  <button
                    onClick={() => { setFailing(p.id); setFailureReason(""); setCompleting(null); }}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Report failed
                  </button>
                </div>
              )}

              {failing === p.id && (
                <div className="mt-3 space-y-2 rounded-md bg-red-50 p-3">
                  <div>
                    <label htmlFor={`fail-reason-${p.id}`} className="block text-xs font-medium text-stone-700">
                      Reason the collection failed
                    </label>
                    <input
                      id={`fail-reason-${p.id}`}
                      value={failureReason}
                      onChange={(e) => setFailureReason(e.target.value)}
                      placeholder="e.g. Access road blocked, customer not home"
                      className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => reportFailure(p.id)}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Submit failure
                    </button>
                    <button
                      onClick={() => { setFailing(null); setFailureReason(""); }}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {completing === p.id && (
                <div className="mt-3 space-y-2 rounded-md bg-emerald-50 p-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-700">Weight collected (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-stone-700">Notes (optional)</label>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitCompletion(p.id)}
                      className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f]"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => setCompleting(null)}
                      className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Completed pickups (collapsed, for reference) */}
        {pickups.filter(p => p.status === "COLLECTED" || p.status === "FAILED").length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-stone-500">Completed / failed today</h3>
            <div className="space-y-2">
              {pickups.filter(p => p.status === "COLLECTED" || p.status === "FAILED").map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-stone-100 bg-white px-4 py-2">
                  <p className="text-sm text-stone-600">{p.waste_category} · {p.address_text || `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[p.status] || "bg-stone-100 text-stone-700"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
