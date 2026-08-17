"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, PickupOut } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-800",
  ASSIGNED: "bg-blue-100 text-blue-800",
  EN_ROUTE: "bg-blue-100 text-blue-800",
  ARRIVED: "bg-blue-100 text-blue-800",
  COLLECTED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  MISSED: "bg-red-100 text-red-800",
  CANCELLED: "bg-stone-200 text-stone-600",
};

export default function DashboardPage() {
  const { token, user, loading, logout } = useAuth();
  const router = useRouter();
  const [pickups, setPickups] = useState<PickupOut[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  useEffect(() => {
    if (!loading && user && user.role === "COLLECTOR") router.push("/collector");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && (user.role === "SUPER_ADMIN" || user.role === "MUNICIPAL_ADMIN")) router.push("/admin");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && user.role === "COMPANY_ADMIN") router.push("/company");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && user.role === "ORGANIZATION_ADMIN") router.push("/organization");
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && user.role === "RECYCLER") router.push("/recycler");
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.myPickups(token).catch(() => ({ items: [], total: 0 })),
      api.pointsBalance(token).catch(() => ({ points_balance: null })),
      api.notifications(token).catch(() => ({ items: [], total: 0 })),
    ]).then(([pickupsRes, pointsRes, notifRes]) => {
      setPickups(pickupsRes.items);
      setPoints(pointsRes.points_balance);
      setUnreadCount(notifRes.items.filter((n) => !n.is_read).length);
      setDataLoading(false);
    });
  }, [token]);

  if (loading || !token) {
    return <main className="flex-1 p-8 text-stone-500">Loading...</main>;
  }

  return (
    <main className="flex-1 bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1b4332]">EcoTrack</h1>
            <p className="text-sm text-stone-500">
              {user?.full_name} · {user?.role}
            </p>
          </div>
          <button onClick={logout} className="text-sm font-medium text-stone-500 hover:text-stone-800">
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm text-stone-500">Your pickups</p>
            <p className="text-2xl font-bold text-stone-900">{pickups.length}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm text-stone-500">Reward points</p>
            <p className="text-2xl font-bold text-[#2d6a4f]">{points ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-sm text-stone-500">Unread notifications</p>
            <p className="text-2xl font-bold text-stone-900">{unreadCount}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">Recent pickups</h2>
          <div className="flex gap-2">
            <Link
              href="/schedules"
              className="rounded-md border border-[#1b4332] px-4 py-2 text-sm font-semibold text-[#1b4332] hover:bg-emerald-50"
            >
              Recurring pickups
            </Link>
            <Link
              href="/pickups/new"
              className="rounded-md bg-[#1b4332] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d6a4f]"
            >
              Request pickup
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {dataLoading && <p className="text-sm text-stone-400">Loading pickups...</p>}
          {!dataLoading && pickups.length === 0 && (
            <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
              No pickups yet. Request your first one.
            </p>
          )}
          {pickups.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-4">
              <div>
                <p className="font-medium text-stone-900">{p.waste_category} · {p.address_text || "Location set"}</p>
                <p className="text-xs text-stone-500">{new Date(p.created_at).toLocaleString()}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[p.status] || "bg-stone-100 text-stone-700"}`}>
                {p.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
