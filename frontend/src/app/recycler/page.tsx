"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

const CATEGORIES = ["ORGANIC", "PLASTIC", "PAPER", "GLASS", "METAL", "ELECTRONIC", "HAZARDOUS", "MIXED", "OTHER"];

interface RecyclingRecord {
  id: string;
  waste_category: string;
  quantity_kg: number;
  received_date: string;
  destination: string | null;
}

export default function RecyclerPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<RecyclingRecord[]>([]);
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof api.recyclingImpactSummary>> | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState("PLASTIC");
  const [quantity, setQuantity] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    setDataLoading(true);
    Promise.all([api.myRecyclingRecords(token).catch(() => []), api.recyclingImpactSummary(token).catch(() => null)]).then(
      ([r, i]) => {
        setRecords(r);
        setImpact(i);
        setDataLoading(false);
      }
    );
  }, [token]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "RECYCLER") router.push("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refresh();
  }, [refresh]);

  async function submitRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) {
      setError("Enter a valid quantity in kg.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.recordRecycling(token, {
        waste_category: category,
        quantity_kg: qty,
        received_date: receivedDate,
        destination: destination || undefined,
      });
      setQuantity("");
      setDestination("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that recycling activity.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  return (
    <main className="flex-1 bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">EcoTrack Recycler</h1>
            <p className="text-sm text-stone-500">{user?.full_name}</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {impact && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
              <p className="text-xs text-stone-500">Total recycled (platform-wide)</p>
              <p className="text-2xl font-bold text-emerald-700">{impact.total_waste_recycled_kg} kg</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
              <p className="text-xs text-stone-500" title="Recycled volume relative to EcoTrack-tracked pickups — can exceed 100% if you receive material from outside sources">
                Diversion rate*
              </p>
              <p className="text-2xl font-bold text-[#1b4332]">{impact.diversion_rate_percent}%</p>
            </div>
          </div>
        )}
        {impact && impact.diversion_rate_percent > 100 && (
          <p className="-mt-4 mb-6 text-xs text-stone-400">
            * Exceeds 100% because recorded recycling includes material from outside EcoTrack-tracked pickups.
          </p>
        )}

        <div className="mb-6 rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Log recycling activity</h2>
          <form onSubmit={submitRecord} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Quantity (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700">Date received</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Destination (optional)</label>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#1b4332] px-3 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f] disabled:opacity-50"
            >
              {submitting ? "Recording..." : "Record recycling activity"}
            </button>
          </form>
        </div>

        <h2 className="mb-3 text-lg font-semibold text-stone-900">Your recycling records</h2>
        {dataLoading && <p className="text-sm text-stone-400">Loading...</p>}
        {!dataLoading && records.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No recycling records yet.
          </p>
        )}
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-stone-900">
                  {r.waste_category} · {r.quantity_kg} kg
                </p>
                <p className="text-xs text-stone-500">
                  {r.received_date} {r.destination ? `→ ${r.destination}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
