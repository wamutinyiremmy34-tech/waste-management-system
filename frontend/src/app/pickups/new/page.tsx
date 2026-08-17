"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

const CATEGORIES = ["ORGANIC", "PLASTIC", "PAPER", "GLASS", "METAL", "ELECTRONIC", "HAZARDOUS", "MIXED", "OTHER"];

export default function NewPickupPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [category, setCategory] = useState("PLASTIC");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function useMyLocation() {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        // Fallback: central Kampala, so the demo still works without location permission.
        setCoords({ lat: 0.3476, lng: 32.5825 });
        setLocating(false);
      }
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!coords) {
      setError("Please set a pickup location first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.requestPickup(token, {
        waste_category: category,
        latitude: coords.lat,
        longitude: coords.lng,
        address_text: address || undefined,
        notes: notes || undefined,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1b4332]">Request a pickup</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Waste type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700">Location</label>
            <button
              type="button"
              onClick={useMyLocation}
              className="mt-1 w-full rounded-md border border-[#2d6a4f] px-3 py-2 text-sm font-medium text-[#2d6a4f] hover:bg-emerald-50"
            >
              {locating ? "Locating..." : coords ? `Location set (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Use my current location"}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700">Address (optional)</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Plot 12, Ntinda Road"
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#1b4332] px-4 py-2 font-semibold text-white hover:bg-[#2d6a4f] disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Request pickup"}
          </button>
        </form>
      </div>
    </main>
  );
}
