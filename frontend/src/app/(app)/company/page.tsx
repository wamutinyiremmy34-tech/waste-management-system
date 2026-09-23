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
  const { token, user, loading } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.companyDashboard>> | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [collectorPerf, setCollectorPerf] = useState<Awaited<ReturnType<typeof api.collectorPerformance>> | null>(null);
  const [opSummary, setOpSummary] = useState<Awaited<ReturnType<typeof api.operationalSummary>> | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [regNumber, setRegNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("Truck");
  const [capacity, setCapacity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (!token || !user?.waste_company_id) return;
    setKpisLoading(true);
    setTablesLoading(true);
    setError(null);
    const companyId = user.waste_company_id;

    api
      .companyDashboard(token, companyId)
      .then((dash) => setDashboard(dash))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load company KPI data."))
      .finally(() => setKpisLoading(false));

    Promise.all([
      api.listVehicles(token),
      api.listCollectors(token),
      api.listZones(token, companyId),
      api.collectorPerformance(token, companyId).catch(() => null),
      api.operationalSummary(token, companyId).catch(() => null),
    ])
      .then(([vehicleList, collectorList, zoneList, cp, op]) => {
        setVehicles(vehicleList);
        setCollectors(collectorList);
        setZones(zoneList);
        setCollectorPerf(cp);
        setOpSummary(op);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load operational tables."))
      .finally(() => setTablesLoading(false));
  }, [token, user]);

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user && user.role !== "COMPANY_ADMIN") {
      router.replace("/dashboard");
    }
  }, [loading, token, user, router]);

  useEffect(() => {
    if (!loading && token && user?.role === "COMPANY_ADMIN") {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token, user]);

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
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-stone-500">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
          <p className="text-sm">Loading company dashboard…</p>
        </div>
      </main>
    );
  }

  if (!user?.waste_company_id) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">
          Your account is not linked to a waste company yet. Contact a platform administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-stone-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        {kpisLoading && <p className="text-sm text-stone-400">Loading operational dashboard...</p>}
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
            <div className={`rounded-lg border bg-white p-4 ${(opSummary?.kpis.unassigned_backlog ?? 0) > 0 ? "border-amber-300" : "border-stone-200"}`}>
              <p className="text-xs text-stone-500">Unassigned backlog</p>
              <p className={`text-2xl font-bold ${(opSummary?.kpis.unassigned_backlog ?? 0) > 0 ? "text-amber-700" : "text-stone-900"}`}>
                {opSummary?.kpis.unassigned_backlog ?? dashboard.pending_pickups}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs text-stone-500">Completed pickups</p>
              <p className="text-2xl font-bold text-emerald-700">{dashboard.completed_pickups}</p>
            </div>
            {opSummary?.kpis && (
              <>
                <div className={`rounded-lg border bg-white p-4 ${opSummary.kpis.failure_rate_percent > 20 ? "border-red-300" : "border-stone-200"}`}>
                  <p className="text-xs text-stone-500">Completion rate</p>
                  <p className={`text-2xl font-bold ${opSummary.kpis.completion_rate_percent >= 80 ? "text-emerald-700" : opSummary.kpis.completion_rate_percent < 60 ? "text-red-600" : "text-amber-700"}`}>
                    {opSummary.kpis.completion_rate_percent}%
                  </p>
                </div>
                <div className="rounded-lg border border-stone-200 bg-white p-4">
                  <p className="text-xs text-stone-500">Waste collected (kg)</p>
                  <p className="text-2xl font-bold text-stone-900">{opSummary.kpis.total_waste_collected_kg.toFixed(1)}</p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Collector performance table */}
        {collectorPerf && collectorPerf.collectors.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-stone-900">Collector performance</h2>
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs font-semibold text-stone-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Collector</th>
                    <th className="px-4 py-3 text-right">Completed</th>
                    <th className="px-4 py-3 text-right">Failed</th>
                    <th className="px-4 py-3 text-right">Kg collected</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {collectorPerf.collectors.map((c) => (
                    <tr key={c.collector_id}>
                      <td className="px-4 py-3 font-medium text-stone-900">{c.full_name}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{c.completions}</td>
                      <td className="px-4 py-3 text-right text-red-600">{c.failures}</td>
                      <td className="px-4 py-3 text-right">{c.total_kg_collected.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right">
                        {c.completion_rate_percent !== null
                          ? <span className={c.completion_rate_percent >= 80 ? "text-emerald-700 font-semibold" : c.completion_rate_percent < 60 ? "text-red-600 font-semibold" : "text-stone-700"}>{c.completion_rate_percent}%</span>
                          : <span className="text-stone-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                          {c.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Vehicles</h2>            {!showVehicleForm && (
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
            {vehicles.length === 0 && !tablesLoading && (
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
            {collectors.length === 0 && !tablesLoading && (
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
            {zones.length === 0 && !tablesLoading && (
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
    </div>
  );
}
