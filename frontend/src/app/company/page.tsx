"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";
import { ZoneDrawer } from "@/components/ZoneDrawer";

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  IN_SERVICE: "bg-blue-100 text-blue-800",
  MAINTENANCE: "bg-amber-100 text-amber-800",
  OUT_OF_SERVICE: "bg-red-100 text-red-800",
};

const VEHICLE_STATUSES = ["AVAILABLE", "ASSIGNED", "IN_SERVICE", "MAINTENANCE", "OUT_OF_SERVICE"];

interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  capacity_kg: number | null;
  status: string;
}

interface Collector {
  id: string;
  user_id: string;
  assigned_zone_id: string | null;
  assigned_vehicle_id: string | null;
  is_active: boolean;
}

export default function CompanyPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.companyDashboard>> | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [regNumber, setRegNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("Truck");
  const [capacity, setCapacity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (!token || !user?.waste_company_id) return;
    setDataLoading(true);
    setError(null);
    Promise.all([
      api.companyDashboard(token, user.waste_company_id),
      api.myCompanyProfile(token, user.waste_company_id),
      api.listVehicles(token),
      api.listCollectors(token),
      api.listZones(token, user.waste_company_id),
    ])
      .then(([dash, profile, vehicleList, collectorList, zoneList]) => {
        setDashboard(dash);
        setCompanyName(profile.name);
        setVehicles(vehicleList);
        setCollectors(collectorList);
        setZones(zoneList);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load company data."))
      .finally(() => setDataLoading(false));
  }, [token, user]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "COMPANY_ADMIN") router.push("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refresh();
  }, [refresh]);

  async function submitVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !regNumber || !vehicleType) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.registerVehicle(token, {
        registration_number: regNumber,
        vehicle_type: vehicleType,
        capacity_kg: capacity ? parseFloat(capacity) : undefined,
      });
      setRegNumber("");
      setCapacity("");
      setShowVehicleForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register that vehicle.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeVehicleStatus(vehicleId: string, status: string) {
    if (!token) return;
    setError(null);
    try {
      await api.updateVehicleStatus(token, vehicleId, status);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update vehicle status.");
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  if (!user?.waste_company_id) {
    return (
      <main className="flex-1 p-8">
        <p className="text-sm text-red-600">
          Your account is not linked to a waste company yet. Contact a platform administrator.
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">{companyName || "EcoTrack Company"}</h1>
            <p className="text-sm text-stone-500">{user?.full_name} · Company Admin</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {dataLoading && <p className="text-sm text-stone-400">Loading operational dashboard...</p>}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        {dashboard && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">Collectors</p>
              <p className="text-2xl font-bold text-stone-900">{dashboard.total_collectors}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">Vehicles</p>
              <p className="text-2xl font-bold text-stone-900">{dashboard.total_vehicles}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">Pending pickups</p>
              <p className="text-2xl font-bold text-amber-700">{dashboard.pending_pickups}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">Completed pickups</p>
              <p className="text-2xl font-bold text-emerald-700">{dashboard.completed_pickups}</p>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Vehicles</h2>
            {!showVehicleForm && (
              <button
                onClick={() => setShowVehicleForm(true)}
                className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
              >
                Register vehicle
              </button>
            )}
          </div>

          {showVehicleForm && (
            <form onSubmit={submitVehicle} className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700">Registration number</label>
                  <input
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    placeholder="UAX 123K"
                    className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700">Vehicle type</label>
                  <input
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Capacity (kg, optional)</label>
                <input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f] disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save vehicle"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowVehicleForm(false)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {vehicles.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">
                No vehicles registered yet.
              </p>
            )}
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-stone-900">
                    {v.registration_number} · {v.vehicle_type}
                  </p>
                  {v.capacity_kg && <p className="text-xs text-stone-500">{v.capacity_kg} kg capacity</p>}
                </div>
                <select
                  value={v.status}
                  onChange={(e) => changeVehicleStatus(v.id, e.target.value)}
                  className={`rounded-full border-0 px-3 py-1 text-xs font-semibold ${VEHICLE_STATUS_COLORS[v.status] || "bg-stone-100"}`}
                >
                  {VEHICLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900">Collectors</h2>
          <div className="mt-4 space-y-2">
            {collectors.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">
                No collector profiles yet. Register a collector user, then create their collector
                profile via <code>/api/v1/collectors</code>.
              </p>
            )}
            {collectors.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm text-stone-700">Collector {c.id.slice(0, 8)}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                  {c.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Collection zones</h2>
          </div>
          <div className="mt-4 space-y-2">
            {zones.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">
                No zones drawn yet.
              </p>
            )}
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
                <p className="text-sm font-medium text-stone-900">{z.name}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${z.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                  {z.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            {user?.waste_company_id && (
              <ZoneDrawer token={token} wasteCompanyId={user.waste_company_id} onZoneCreated={refresh} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
