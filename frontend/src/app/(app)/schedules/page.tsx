"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { Button, EmptyState, LoadingState } from "@/components/ui";

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
    if (loading) return;
    if (!token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && token) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token]);

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
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-stone-500">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
          <p className="text-sm">Loading schedules…</p>
        </div>
      </main>
    );
  }

  return (
    <div className="bg-stone-50 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-eco-900">Recurring pickups</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowForm((s) => !s)}
          >
            {showForm ? "Cancel" : "New schedule"}
          </Button>
        </div>

        {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {showForm && (
          <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-stone-700">Waste type</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-eco-500 focus:outline-none focus:ring-2 focus:ring-eco-200">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-eco-500 focus:outline-none focus:ring-2 focus:ring-eco-200">
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
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-eco-500 focus:outline-none focus:ring-2 focus:ring-eco-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Location</label>
              <button
                type="button"
                onClick={useMyLocation}
                className="mt-1 w-full rounded-md border border-eco-700 px-3 py-2 text-sm font-medium text-eco-700 hover:bg-eco-50 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-eco-200"
              >
                {coords ? `Location set (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Use my current location"}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Address (optional)</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-eco-500 focus:outline-none focus:ring-2 focus:ring-eco-200" />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={submitting}
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create schedule"}
            </Button>
          </form>
        )}

        <div className="mt-6 space-y-3">
          {dataLoading && <LoadingState variant="spinner" />}
          {!dataLoading && schedules.length === 0 && (
            <EmptyState
              title="No schedules yet"
              description="Create a recurring pickup schedule to have collections happen automatically."
              action={{
                label: "New schedule",
                onClick: () => setShowForm(true),
              }}
            />
          )}
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1 pr-3">
                <p className="font-medium text-stone-900 truncate">
                  {s.waste_category.charAt(0) + s.waste_category.slice(1).toLowerCase()} · {s.frequency.charAt(0) + s.frequency.slice(1).toLowerCase()}
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  {s.address_text || "Location set"} · Next: {s.next_run_date || "—"}
                </p>
              </div>
              {s.is_active ? (
                <button onClick={() => deactivate(s.id)} className="text-sm font-medium text-red-600 hover:text-red-800 min-h-[44px] px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-red-200">
                  Cancel
                </button>
              ) : (
                <span className="text-xs text-stone-400 shrink-0">Inactive</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
