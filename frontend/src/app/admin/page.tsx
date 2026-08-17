"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, downloadAuthenticatedFile } from "@/lib/api";

const ADMIN_ROLES = ["SUPER_ADMIN", "MUNICIPAL_ADMIN"];

interface Complaint {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

const COMPLAINT_TRANSITIONS: Record<string, string[]> = {
  REPORTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["ASSIGNED", "REJECTED"],
  ASSIGNED: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["RESOLVED", "REJECTED"],
};

const STATUS_COLORS: Record<string, string> = {
  REPORTED: "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-blue-100 text-blue-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-stone-200 text-stone-600",
};

export default function AdminPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.adminDashboard>> | null>(null);
  const [wasteByCategory, setWasteByCategory] = useState<Record<string, number>>({});
  const [complaintStats, setComplaintStats] = useState<Awaited<ReturnType<typeof api.complaintAnalytics>> | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [recyclerId, setRecyclerId] = useState("");

  const refresh = useCallback(() => {
    if (!token) return;
    setDataLoading(true);
    Promise.all([
      api.adminDashboard(token).catch(() => null),
      api.wasteByCategory(token).catch(() => ({})),
      api.complaintAnalytics(token).catch(() => null),
      api.listComplaints(token).catch(() => ({ items: [], total: 0 })),
    ]).then(([dash, waste, complaintAnalytics, complaintsList]) => {
      setStats(dash);
      setWasteByCategory(waste);
      setComplaintStats(complaintAnalytics);
      setComplaints(complaintsList.items);
      setDataLoading(false);
    });
  }, [token]);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && !ADMIN_ROLES.includes(user.role)) router.push("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    refresh();
  }, [refresh]);

  async function advanceComplaint(id: string, nextStatus: string) {
    if (!token) return;
    setActionError(null);
    try {
      await api.updateComplaintStatus(token, id, nextStatus);
      refresh();
    } catch {
      setActionError("Could not update that complaint. Please try again.");
    }
  }

  async function downloadReport(report: "collections" | "complaints" | "recycling" | "environmental", format: "csv" | "pdf") {
    if (!token) return;
    const key = `${report}.${format}`;
    setDownloading(key);
    setActionError(null);
    try {
      // Real query-string filtering, matching exactly what the backend
      // supports per report type (see docs/reporting.md) — date range
      // applies to every report; organization_id/zone_id only make sense
      // for collections; recycler_id only for recycling. Filters that
      // don't apply to the report being downloaded are simply omitted
      // rather than sent and ignored, so the URL reflects what's actually
      // in effect.
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (report === "collections") {
        if (organizationId) params.set("organization_id", organizationId);
        if (zoneId) params.set("zone_id", zoneId);
      }
      if (report === "recycling" && recyclerId) {
        params.set("recycler_id", recyclerId);
      }
      const query = params.toString();
      await downloadAuthenticatedFile(`/reports/${key}${query ? `?${query}` : ""}`, token, `${report}_report.${format}`);
    } catch {
      setActionError(`Could not download the ${report} report. Please try again.`);
    } finally {
      setDownloading(null);
    }
  }

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  const maxWaste = Math.max(1, ...Object.values(wasteByCategory));

  return (
    <main className="flex-1 bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">EcoTrack Admin</h1>
            <p className="text-sm text-stone-500">{user?.full_name} · {user?.role}</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {dataLoading && <p className="text-sm text-stone-400">Loading dashboard...</p>}

        {stats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total users" value={stats.total_users} />
            <StatCard label="Active users" value={stats.active_users} />
            <StatCard label="Completed collections" value={stats.completed_collections} highlight />
            <StatCard label="Missed collections" value={stats.missed_collections} warn={stats.missed_collections > 0} />
            <StatCard label="Waste collected (kg)" value={stats.waste_collected_kg} />
            <StatCard label="Recycled waste (kg)" value={stats.recycled_waste_kg} highlight />
            <StatCard label="Total complaints" value={stats.complaints_total} />
            <StatCard label="Unresolved complaints" value={stats.unresolved_complaints} warn={stats.unresolved_complaints > 0} />
          </div>
        )}

        {Object.keys(wasteByCategory).length > 0 && (
          <div className="mt-8 rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-stone-700">Waste collected by category (kg)</h2>
            <div className="space-y-2">
              {Object.entries(wasteByCategory).map(([cat, kg]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-stone-600">{cat}</span>
                  <div className="h-4 flex-1 rounded bg-stone-100">
                    <div
                      className="h-4 rounded bg-[#2d6a4f]"
                      style={{ width: `${Math.max(4, (kg / maxWaste) * 100)}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-stone-500">{kg} kg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {complaintStats && (
          <div className="mt-8 rounded-lg border border-stone-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold text-stone-700">Complaint resolution rate</h2>
            <p className="text-3xl font-bold text-[#1b4332]">{complaintStats.resolution_rate_percent}%</p>
          </div>
        )}

        <div className="mt-8 rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-stone-700">Reports</h2>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="block text-xs font-medium text-stone-600">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600">To date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600" title="Applies to the collections report only">
                Organization ID
              </label>
              <input
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="collections only"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600" title="Applies to the collections report only">
                Zone ID
              </label>
              <input
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                placeholder="collections only"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600" title="Applies to the recycling report only">
                Recycler ID
              </label>
              <input
                value={recyclerId}
                onChange={(e) => setRecyclerId(e.target.value)}
                placeholder="recycling only"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["collections", "complaints", "recycling", "environmental"] as const).map((report) => (
              <div key={report} className="flex overflow-hidden rounded-md border border-stone-300">
                <span className="bg-stone-50 px-3 py-1.5 text-xs font-medium capitalize text-stone-600">{report}</span>
                {(["csv", "pdf"] as const).map((format) => (
                  <button
                    key={format}
                    onClick={() => downloadReport(report, format)}
                    disabled={downloading === `${report}.${format}`}
                    className="border-l border-stone-300 px-3 py-1.5 text-xs font-semibold text-[#2d6a4f] hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {downloading === `${report}.${format}` ? "..." : format.toUpperCase()}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {actionError && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}

        <h2 className="mt-8 mb-3 text-lg font-semibold text-stone-900">Complaints</h2>
        <div className="space-y-3">
          {complaints.length === 0 && !dataLoading && (
            <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
              No complaints reported yet.
            </p>
          )}
          {complaints.map((c) => (
            <div key={c.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-stone-900">{c.category.replace("_", " ")}</p>
                  <p className="text-sm text-stone-600">{c.description}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[c.status] || "bg-stone-100"}`}>
                  {c.status.replace("_", " ")}
                </span>
              </div>
              {(COMPLAINT_TRANSITIONS[c.status] || []).length > 0 && (
                <div className="mt-3 flex gap-2">
                  {COMPLAINT_TRANSITIONS[c.status].map((next) => (
                    <button
                      key={next}
                      onClick={() => advanceComplaint(c.id, next)}
                      className={
                        next === "REJECTED"
                          ? "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                          : "rounded-md bg-[#1b4332] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2d6a4f]"
                      }
                    >
                      {next === "REJECTED" ? "Reject" : `Move to ${next.replace("_", " ")}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, highlight, warn }: { label: string; value: number; highlight?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-2xl font-bold ${warn ? "text-red-600" : highlight ? "text-emerald-700" : "text-stone-900"}`}>{value}</p>
    </div>
  );
}
