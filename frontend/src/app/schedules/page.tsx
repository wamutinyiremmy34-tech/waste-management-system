"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

const CATEGORIES = ["ORGANIC", "PLASTIC", "PAPER", "GLASS", "METAL", "ELECTRONIC", "HAZARDOUS", "MIXED", "OTHER"];
const FREQUENCIES = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "MONTHLY", label: "Monthly" },
];

interface Schedule {
  id: string;
  frequency: string;
  waste_category: string;
  address_text: string | null;
  next_run_date: string | null;
  is_active: boolean;
}

export default function SchedulesPage() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState("ORGANIC");
  const [frequency, setFrequency] = useState("WEEKLY");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [firstRunDate, setFirstRunDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    setDataLoading(true);
    api
      .myRecurringSchedules(token)
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setDataLoading(false));
  }, [token]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refresh();
  }, [refresh]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords({ lat: 0.3476, lng: 32.5825 })
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !coords) {
      setError("Please set a location first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createRecurringSchedule(token, {
        frequency,
        waste_category: category,
        latitude: coords.lat,
        longitude: coords.lng,
        address_text: address || undefined,
        first_run_date: firstRunDate,
      });
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(id: string) {
    if (!token) return;
    try {
      await api.deactivateRecurringSchedule(token, id);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  return (
    <main className="flex-1 bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1b4332]">Recurring pickups</h1>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
          >
            {showForm ? "Cancel" : "New schedule"}
          </button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={submit} className="mt-4 space-y-4 rounded-lg border border-stone-200 bg-white p-6">
            <div>
              <label className="block text-sm font-medium text-stone-700">Waste type</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm">
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Starting from</label>
              <input
                type="date"
                value={firstRunDate}
                onChange={(e) => setFirstRunDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Location</label>
              <button
                type="button"
                onClick={useMyLocation}
                className="mt-1 w-full rounded-md border border-[#2d6a4f] px-3 py-2 text-sm font-medium text-[#2d6a4f] hover:bg-emerald-50"
              >
                {coords ? `Location set (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Use my current location"}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Address (optional)</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-[#1b4332] px-4 py-2 font-semibold text-white hover:bg-[#2d6a4f] disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create schedule"}
            </button>
          </form>
        )}

        <div className="mt-6 space-y-3">
          {dataLoading && <p className="text-sm text-stone-400">Loading...</p>}
          {!dataLoading && schedules.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
              No recurring schedules yet.
            </p>
          )}
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-4">
              <div>
                <p className="font-medium text-stone-900">
                  {s.waste_category} · {s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()}
                </p>
                <p className="text-xs text-stone-500">
                  {s.address_text || "Location set"} · Next: {s.next_run_date || "—"}
                </p>
              </div>
              {s.is_active ? (
                <button onClick={() => deactivate(s.id)} className="text-sm font-medium text-red-600 hover:text-red-800">
                  Cancel
                </button>
              ) : (
                <span className="text-xs text-stone-400">Inactive</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
