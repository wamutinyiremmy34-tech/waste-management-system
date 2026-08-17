"use client";

import { useEffect, useState, useCallback } from "react";
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
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();
  const [pickups, setPickups] = useState<PickupOut[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const { isOnline, pending, syncing, queueOrSend } = useOfflineQueue(token);

  const refresh = useCallback(() => {
    if (!token) return;
    setDataLoading(true);
    api
      .assignedPickups(token)
      .then((res) => setPickups(res.items))
      .catch(() => setPickups([]))
      .finally(() => setDataLoading(false));
  }, [token]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "COLLECTOR") router.push("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount; refresh() sets loading/data state as the fetch resolves
    refresh();
  }, [refresh]);

  // Re-pull the assignment list once a sync finishes, so completed/queued
  // actions that just landed on the server show up with their real status.
  useEffect(() => {
    if (!syncing && pending.length === 0) {
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
    const reason = window.prompt("Reason the collection failed:");
    if (!reason) return;
    setActionError(null);
    try {
      await queueOrSend("fail_collection", pickupId, { failure_reason: reason }, () =>
        api.failCollection(token, pickupId, reason).then(() => undefined)
      );
      if (navigator.onLine) refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  const activePickups = pickups.filter((p) => p.status !== "COLLECTED" && p.status !== "FAILED");
  const doneToday = pickups.filter((p) => p.status === "COLLECTED").length;
  const conflicted = pending.filter((a) => a.lastError);

  return (
    <main className="flex-1 bg-stone-50">
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

      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">EcoTrack Collector</h1>
            <p className="text-sm text-stone-500">{user?.full_name}</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

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

        {dataLoading && <p className="text-sm text-stone-400">Loading...</p>}
        {!dataLoading && pickups.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No pickups assigned to you yet.
          </p>
        )}

        <div className="space-y-3">
          {pickups.map((p) => (
            <div key={p.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
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
                    onClick={() => reportFailure(p.id)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Report failed
                  </button>
                </div>
              )}

              {p.status === "ARRIVED" && completing !== p.id && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setCompleting(p.id)}
                    className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f]"
                  >
                    Complete collection
                  </button>
                  <button
                    onClick={() => reportFailure(p.id)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Report failed
                  </button>
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
      </div>
    </main>
  );
}
