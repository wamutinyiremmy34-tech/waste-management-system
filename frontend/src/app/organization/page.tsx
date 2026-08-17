"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/lib/api";

export default function OrganizationPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<{ name: string; org_type: string } | null>(null);
  const [analytics, setAnalytics] = useState<{ total_waste_kg: number; by_category_kg: Record<string, number> } | null>(
    null
  );
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const [staff, setStaff] = useState<{ id: string; email: string; full_name: string; is_active: boolean }[]>([]);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffSubmitting, setStaffSubmitting] = useState(false);

  const refresh = useCallback(() => {
    if (!token || !user?.organization_id) return;
    setDataLoading(true);
    setError(null);
    Promise.all([
      api.myOrganizationProfile(token, user.organization_id),
      api.organizationWasteAnalytics(token, user.organization_id),
      api.listOrganizationStaff(token, user.organization_id),
    ])
      .then(([p, a, s]) => {
        setProfile(p);
        setAnalytics(a);
        setStaff(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load organization data."))
      .finally(() => setDataLoading(false));
  }, [token, user]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && user.role !== "ORGANIZATION_ADMIN") router.push("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refresh();
  }, [refresh]);

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setCoords({ lat: 0.3476, lng: 32.5825 });
        setLocating(false);
      }
    );
  }

  async function submitLocation() {
    if (!token || !user?.organization_id || !coords || !locationLabel) return;
    setError(null);
    try {
      await api.addOrganizationLocation(token, user.organization_id, {
        label: locationLabel,
        latitude: coords.lat,
        longitude: coords.lng,
        address_text: locationAddress || undefined,
      });
      setAddSuccess(`Added location "${locationLabel}"`);
      setShowLocationForm(false);
      setLocationLabel("");
      setLocationAddress("");
      setCoords(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that location.");
    }
  }

  async function submitStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !user?.organization_id || !staffEmail || !staffName) return;
    setStaffSubmitting(true);
    setError(null);
    try {
      await api.addOrganizationStaff(token, user.organization_id, { email: staffEmail, full_name: staffName });
      setAddSuccess(`Added staff member "${staffName}"`);
      setShowStaffForm(false);
      setStaffEmail("");
      setStaffName("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that staff member.");
    } finally {
      setStaffSubmitting(false);
    }
  }

  async function deactivateStaffMember(staffId: string, name: string) {
    if (!token || !user?.organization_id) return;
    if (!window.confirm(`Deactivate ${name}'s account?`)) return;
    setError(null);
    try {
      await api.deactivateOrganizationStaff(token, user.organization_id, staffId);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not deactivate that staff member.");
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  if (!user?.organization_id) {
    return (
      <main className="flex-1 p-8">
        <p className="text-sm text-red-600">
          Your account is not linked to an organization yet. Contact a platform administrator.
        </p>
      </main>
    );
  }

  const maxWaste = analytics ? Math.max(1, ...Object.values(analytics.by_category_kg)) : 1;

  return (
    <main className="flex-1 bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">{profile?.name || "EcoTrack Organization"}</h1>
            <p className="text-sm text-stone-500">{user?.full_name} · {profile?.org_type || "Organization"} Admin</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {dataLoading && <p className="text-sm text-stone-400">Loading organization data...</p>}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {addSuccess && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{addSuccess}</p>}

        {analytics && (
          <>
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <p className="text-xs text-stone-500">Total waste recorded</p>
              <p className="text-3xl font-bold text-[#1b4332]">{analytics.total_waste_kg} kg</p>
            </div>

            {Object.keys(analytics.by_category_kg).length > 0 && (
              <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-stone-700">By waste category (kg)</h2>
                <div className="space-y-2">
                  {Object.entries(analytics.by_category_kg).map(([cat, kg]) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs font-medium text-stone-600">{cat}</span>
                      <div className="h-4 flex-1 rounded bg-stone-100">
                        <div className="h-4 rounded bg-[#2d6a4f]" style={{ width: `${Math.max(4, (kg / maxWaste) * 100)}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-stone-500">{kg} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Locations</h2>
            {!showLocationForm && (
              <button
                onClick={() => setShowLocationForm(true)}
                className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
              >
                Add location
              </button>
            )}
          </div>

          {showLocationForm && (
            <div className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
              <div>
                <label className="block text-xs font-medium text-stone-700">Label</label>
                <input
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="e.g. Main campus, Branch office"
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Address (optional)</label>
                <input
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={useMyLocation}
                className="w-full rounded-md border border-[#2d6a4f] px-3 py-1.5 text-sm font-medium text-[#2d6a4f] hover:bg-emerald-50"
              >
                {locating ? "Locating..." : coords ? `Location set (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : "Use current location"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={submitLocation}
                  disabled={!coords || !locationLabel}
                  className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f] disabled:opacity-50"
                >
                  Save location
                </button>
                <button
                  onClick={() => setShowLocationForm(false)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Staff</h2>
            {!showStaffForm && (
              <button
                onClick={() => setShowStaffForm(true)}
                className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
              >
                Add staff member
              </button>
            )}
          </div>

          {showStaffForm && (
            <form onSubmit={submitStaff} className="mt-4 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
              <div>
                <label className="block text-xs font-medium text-stone-700">Full name</label>
                <input
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700">Email</label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <p className="text-xs text-stone-400">
                A real account is created with a random password — this MVP doesn&apos;t send email,
                so share credentials with the new staff member directly for now (see
                docs/notifications.md).
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={staffSubmitting || !staffName || !staffEmail}
                  className="rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f] disabled:opacity-50"
                >
                  {staffSubmitting ? "Adding..." : "Save staff member"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowStaffForm(false)}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {staff.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-4 text-center text-sm text-stone-500">
                No staff members yet.
              </p>
            )}
            {staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-stone-900">{s.full_name}</p>
                  <p className="text-xs text-stone-500">{s.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                  {s.is_active && (
                    <button
                      onClick={() => deactivateStaffMember(s.id, s.full_name)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
          Recurring collection-schedule management from the organization dashboard is not yet built
          — available via the API (<code>/api/v1/recurring-schedules</code>) and interactive docs at{" "}
          <code>/docs</code> in the meantime.
        </div>
      </div>
    </main>
  );
}
