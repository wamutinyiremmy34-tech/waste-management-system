"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, downloadAuthenticatedFile } from "@/lib/api";

const ADMIN_ROLES = ["SUPER_ADMIN", "MUNICIPAL_ADMIN"];

// ---------------------------------------------------------------------------
// Complaint status helpers
// ---------------------------------------------------------------------------
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
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  LOW: "bg-stone-100 text-stone-700",
};
const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "border-red-200 bg-red-50",
  MEDIUM: "border-amber-200 bg-amber-50",
  LOW: "border-stone-200 bg-stone-50",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AdminPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();

  // Existing data
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.adminDashboard>> | null>(null);
  const [wasteByCategory, setWasteByCategory] = useState<Record<string, number>>({});
  const [complaintStats, setComplaintStats] = useState<Awaited<ReturnType<typeof api.complaintAnalytics>> | null>(null);
  const [complaints, setComplaints] = useState<{ id: string; category: string; description: string; status: string; created_at: string }[]>([]);

  // Phase 2 data
  const [opSummary, setOpSummary] = useState<Awaited<ReturnType<typeof api.operationalSummary>> | null>(null);
  const [zonePerf, setZonePerf] = useState<Awaited<ReturnType<typeof api.zonePerformance>> | null>(null);
  const [trend, setTrend] = useState<{ date: string; completed: number; failed: number; total: number }[]>([]);
  const [hotspots, setHotspots] = useState<{ cluster_id: number; complaint_count: number; latitude: number; longitude: number }[]>([]);
  const [envImpact, setEnvImpact] = useState<Awaited<ReturnType<typeof api.environmentalImpact>> | null>(null);

  const [dataLoading, setDataLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "zones" | "priority" | "complaints" | "reports">("overview");

  // Report filters
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
      api.operationalSummary(token).catch(() => null),
      api.zonePerformance(token).catch(() => null),
      api.collectionTrend(token, undefined, 30).catch(() => null),
      api.hotspots(token).catch(() => null),
      api.environmentalImpact(token).catch(() => null),
    ]).then(([dash, waste, cStats, cList, opSum, zones, trendData, hots, envData]) => {
      setStats(dash);
      setWasteByCategory(waste);
      setComplaintStats(cStats);
      setComplaints(cList.items);
      setOpSummary(opSum);
      setZonePerf(zones);
      setTrend(trendData?.trend ?? []);
      setHotspots(hots?.hotspots ?? []);
      setEnvImpact(envData);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function advanceComplaint(id: string, nextStatus: string) {
    if (!token) return;
    setActionError(null);
    try {
      await api.updateComplaintStatus(token, id, nextStatus);
      refresh();
    } catch {
      setActionError("Could not update that complaint.");
    }
  }

  async function downloadReport(
    report: "collections" | "complaints" | "recycling" | "environmental",
    format: "csv" | "pdf"
  ) {
    if (!token) return;
    const key = `${report}.${format}`;
    setDownloading(key);
    setActionError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      if (report === "collections") {
        if (organizationId) params.set("organization_id", organizationId);
        if (zoneId) params.set("zone_id", zoneId);
      }
      if (report === "recycling" && recyclerId) params.set("recycler_id", recyclerId);
      const qs = params.toString();
      await downloadAuthenticatedFile(`/reports/${key}${qs ? `?${qs}` : ""}`, token, `${report}_report.${format}`);
    } catch {
      setActionError(`Could not download the ${report} report.`);
    } finally {
      setDownloading(null);
    }
  }

  if (loading || !token) return <main className="flex-1 p-8 text-stone-500">Loading...</main>;

  const maxWaste = Math.max(1, ...Object.values(wasteByCategory));
  const trendMax = Math.max(1, ...trend.map((d) => d.total));

  return (
    <main className="flex-1 bg-stone-50">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">EcoTrack — Municipal Command Centre</h1>
            <p className="text-sm text-stone-500">{user?.full_name} · {user?.role}</p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">Sign out</button>
        </div>
      </header>

      {/* Attention items banner */}
      {opSummary && opSummary.attention_items.length > 0 && (
        <div className="border-b border-stone-200 bg-white px-6 py-3">
          <div className="mx-auto max-w-6xl space-y-1">
            {opSummary.attention_items.map((item, i) => (
              <div key={i} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${SEVERITY_COLORS[item.severity] || "border-stone-200"}`}>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${item.severity === "HIGH" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                  {item.severity}
                </span>
                <span className="font-medium text-stone-800">{item.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6">
          <nav className="flex gap-1">
            {(["overview", "zones", "priority", "complaints", "reports"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-[#1b4332] text-[#1b4332]"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                }`}
              >
                {tab === "priority" ? "Priority Queue" : tab}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {dataLoading && <p className="text-sm text-stone-400">Loading operational data...</p>}
        {actionError && <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}

        {/* ─────────────────── OVERVIEW TAB ─────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI stat cards */}
            {stats && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Platform Overview</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Completed collections" value={stats.completed_collections} highlight />
                  <StatCard label="Unassigned backlog" value={opSummary?.kpis.unassigned_backlog ?? 0} warn={(opSummary?.kpis.unassigned_backlog ?? 0) > 5} />
                  <StatCard label="Failed collections" value={stats.failed_collections ?? 0} warn={(stats.failed_collections ?? 0) > 0} />
                  <StatCard label="Missed collections" value={stats.missed_collections} warn={stats.missed_collections > 0} />
                  <StatCard label="Waste collected (kg)" value={stats.waste_collected_kg} />
                  <StatCard label="Recycled (kg)" value={stats.recycled_waste_kg} highlight />
                  <StatCard label="Unresolved complaints" value={stats.unresolved_complaints} warn={stats.unresolved_complaints > 0} />
                  <StatCard label="Completion rate" value={`${stats.completion_rate_percent ?? 0}%`} highlight={(stats.completion_rate_percent ?? 0) >= 80} warn={(stats.completion_rate_percent ?? 0) < 60} />
                </div>
              </section>
            )}

            {/* Collection trend (30-day bar chart) */}
            {trend.length > 0 && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-stone-700">Collection activity — last 30 days</h2>
                <div className="flex h-24 items-end gap-0.5 overflow-hidden">
                  {trend.slice(-30).map((day) => (
                    <div key={day.date} className="group relative flex flex-1 flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t bg-emerald-500 opacity-80"
                        style={{ height: `${(day.completed / trendMax) * 100}%` }}
                        title={`${day.date}: ${day.completed} completed`}
                      />
                      {day.failed > 0 && (
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-red-300"
                          style={{ height: `${(day.failed / trendMax) * 100}%` }}
                          title={`${day.date}: ${day.failed} failed`}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-emerald-500" /> Completed</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-300" /> Failed</span>
                </div>
              </section>
            )}

            {/* Waste by category */}
            {Object.keys(wasteByCategory).length > 0 && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="mb-4 text-sm font-semibold text-stone-700">Waste collected by category (kg)</h2>
                <div className="space-y-2">
                  {Object.entries(wasteByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, kg]) => (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs font-medium text-stone-600">{cat}</span>
                        <div className="h-4 flex-1 rounded bg-stone-100">
                          <div className="h-4 rounded bg-[#2d6a4f]" style={{ width: `${Math.max(4, (kg / maxWaste) * 100)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs text-stone-500">{kg.toFixed(1)} kg</span>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* Environmental impact */}
            {envImpact && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="mb-1 text-sm font-semibold text-stone-700">Environmental impact</h2>
                <p className="mb-4 text-xs text-stone-400">CO₂e figures are estimates — see docs/environmental-impact.md</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-stone-500">Waste collected</p>
                    <p className="text-xl font-bold text-stone-900">{envImpact.total_waste_collected_kg} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500">Waste recycled</p>
                    <p className="text-xl font-bold text-emerald-700">{envImpact.total_waste_recycled_kg} kg</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500">Diversion rate</p>
                    <p className="text-xl font-bold text-[#1b4332]">{envImpact.diversion_rate_percent}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone-500">Est. CO₂e avoided</p>
                    <p className="text-xl font-bold text-stone-900">{envImpact.estimated_co2e_avoided_kg} kg</p>
                    <p className="text-[10px] text-stone-400">estimate</p>
                  </div>
                </div>
              </section>
            )}

            {/* Complaint analytics */}
            {complaintStats && (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-stone-200 bg-white p-5">
                  <h2 className="mb-3 text-sm font-semibold text-stone-700">Complaints by category</h2>
                  <div className="space-y-1">
                    {Object.entries(complaintStats.by_category).map(([cat, n]) => (
                      <div key={cat} className="flex justify-between text-sm">
                        <span className="text-stone-600">{cat.replace(/_/g, " ")}</span>
                        <span className="font-semibold text-stone-900">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-stone-200 bg-white p-5">
                  <h2 className="mb-3 text-sm font-semibold text-stone-700">Complaints by status</h2>
                  <div className="space-y-1">
                    {Object.entries(complaintStats.by_status).map(([s, n]) => (
                      <div key={s} className="flex justify-between text-sm">
                        <span className="text-stone-600">{s.replace(/_/g, " ")}</span>
                        <span className="font-semibold text-stone-900">{n}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-lg font-bold text-[#1b4332]">{complaintStats.resolution_rate_percent}% resolved</p>
                </div>
              </section>
            )}

            {/* Hotspots */}
            {hotspots.length > 0 && (
              <section className="rounded-lg border border-stone-200 bg-white p-5">
                <h2 className="mb-1 text-sm font-semibold text-stone-700">Complaint hotspots</h2>
                <p className="mb-4 text-xs text-stone-400">Spatial clusters detected via PostGIS ST_ClusterDBSCAN. Not ML prediction.</p>
                <div className="space-y-2">
                  {hotspots.map((h) => (
                    <div key={h.cluster_id} className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2">
                      <div>
                        <p className="text-sm font-medium text-stone-800">
                          Cluster {h.cluster_id + 1} — {h.complaint_count} complaints
                        </p>
                        <p className="text-xs text-stone-500">
                          {h.latitude.toFixed(4)}°N, {h.longitude.toFixed(4)}°E
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
                        {h.complaint_count} reports
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ─────────────────── ZONES TAB ─────────────────── */}
        {activeTab === "zones" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Zone performance</h2>
            {zonePerf?.zones.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                No active zones found. Create zones via the Company dashboard.
              </p>
            )}
            <div className="space-y-3">
              {(zonePerf?.zones ?? []).map((z) => (
                <div
                  key={z.zone_id}
                  className={`rounded-lg border bg-white p-4 ${z.attention_needed ? "border-amber-300" : "border-stone-200"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-stone-900">{z.zone_name}</p>
                      <p className="text-sm text-stone-500">
                        {z.total_pickups} pickups · {z.waste_collected_kg.toFixed(1)} kg collected
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {z.completion_rate_percent !== null && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${z.completion_rate_percent >= 75 ? "bg-emerald-100 text-emerald-800" : z.completion_rate_percent >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                          {z.completion_rate_percent}% completion
                        </span>
                      )}
                      {z.attention_needed && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">NEEDS ATTENTION</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded bg-stone-50 p-2">
                      <p className="font-semibold text-emerald-700">{z.completed}</p>
                      <p className="text-stone-500">completed</p>
                    </div>
                    <div className="rounded bg-stone-50 p-2">
                      <p className={`font-semibold ${z.failed_or_missed > 0 ? "text-red-600" : "text-stone-900"}`}>{z.failed_or_missed}</p>
                      <p className="text-stone-500">failed/missed</p>
                    </div>
                    <div className="rounded bg-stone-50 p-2">
                      <p className="font-semibold text-blue-700">{z.active}</p>
                      <p className="text-stone-500">in progress</p>
                    </div>
                    <div className="rounded bg-stone-50 p-2">
                      <p className={`font-semibold ${z.unresolved_complaints > 0 ? "text-amber-700" : "text-stone-900"}`}>{z.unresolved_complaints}</p>
                      <p className="text-stone-500">unresolved complaints</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─────────────────── PRIORITY QUEUE TAB ─────────────────── */}
        {activeTab === "priority" && (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-stone-900">Priority pickup queue</h2>
              <p className="text-sm text-stone-500 mt-1">
                Pickups ordered by priority score = overdue_days × 2.0 (CollectionPrioritizer — rule-based, not ML)
              </p>
            </div>
            {!opSummary && !dataLoading && <p className="text-sm text-stone-400">Loading queue...</p>}
            {opSummary?.overdue_pickups.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                No overdue pickups. Good operational health.
              </p>
            )}
            <div className="space-y-2">
              {(opSummary?.overdue_pickups ?? []).map((p) => (
                <div key={p.pickup_id} className="flex items-start justify-between rounded-lg border border-stone-200 bg-white p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PRIORITY_COLORS[p.priority_label]}`}>
                        {p.priority_label}
                      </span>
                      <span className="text-sm font-medium text-stone-800">{p.waste_category}</span>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">{p.address_text || "No address"}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {p.overdue_days > 0 ? `${p.overdue_days} day${p.overdue_days !== 1 ? "s" : ""} overdue` : "Due today"} ·{" "}
                      Status: {p.status} ·{" "}
                      {p.collector_name ? `Assigned to: ${p.collector_name}` : "Unassigned"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-stone-700">{p.priority_score}</p>
                    <p className="text-xs text-stone-400">score</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─────────────────── COMPLAINTS TAB ─────────────────── */}
        {activeTab === "complaints" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Complaint management</h2>
            {complaints.length === 0 && !dataLoading && (
              <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                No complaints reported yet.
              </p>
            )}
            <div className="space-y-3">
              {complaints.map((c) => (
                <div key={c.id} className="rounded-lg border border-stone-200 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-stone-900">{c.category.replace(/_/g, " ")}</p>
                      <p className="text-sm text-stone-600">{c.description}</p>
                      <p className="mt-1 text-xs text-stone-400">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[c.status] || "bg-stone-100"}`}>
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  {(COMPLAINT_TRANSITIONS[c.status] ?? []).length > 0 && (
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
                          {next === "REJECTED" ? "Reject" : `→ ${next.replace(/_/g, " ")}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─────────────────── REPORTS TAB ─────────────────── */}
        {activeTab === "reports" && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-stone-900">Reports</h2>
            <div className="rounded-lg border border-stone-200 bg-white p-5">
              <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "From date", type: "date", value: dateFrom, set: setDateFrom },
                  { label: "To date", type: "date", value: dateTo, set: setDateTo },
                  { label: "Organization ID", type: "text", value: organizationId, set: setOrganizationId, hint: "collections only" },
                  { label: "Zone ID", type: "text", value: zoneId, set: setZoneId, hint: "collections only" },
                  { label: "Recycler ID", type: "text", value: recyclerId, set: setRecyclerId, hint: "recycling only" },
                ].map(({ label, type, value, set, hint }) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-stone-600">{label}</label>
                    {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
                    <input
                      type={type}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-xs"
                    />
                  </div>
                ))}
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
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Reusable stat card
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-2xl font-bold ${warn ? "text-red-600" : highlight ? "text-emerald-700" : "text-stone-900"}`}>
        {value}
      </p>
    </div>
  );
}
