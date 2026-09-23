"use client";

/**
 * Citizen Dashboard — Phase 3 redesign
 *
 * Layout (top → bottom):
 *  1. Hero: time-aware greeting + contextual status sentence
 *  2. Primary CTA: Request Pickup (full-width mobile, constrained desktop)
 *  3. Active/next pickup card: waste type, address, timeline, cancel
 *  4. Summary stats: Total · Active · Completed · Reward points · CO₂e avoided
 *  5. Quick actions: Request Pickup · Schedules
 *  6. Notifications snippet: last 3 unread (mark-all-read deferred Phase 4)
 *  7. Recent pickup history: last 5 pickups with StatusBadge
 *
 * API calls (all citizen-accessible, no admin endpoints):
 *  - GET /pickups/mine              — pickup list (items + total from envelope)
 *  - GET /rewards/balance           — points
 *  - GET /notifications             — unread count + recent items
 *  - GET /operations/environmental-impact — CO₂e (platform-wide, any user)
 *
 * Error handling: each section fails independently. If notifications or
 * environmental-impact fail, the core pickup sections remain visible.
 *
 * Role redirects: preserved exactly from Phase 2.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api, type PickupOut } from "@/lib/api";
import {
  StatCard,
  StatusBadge,
  EmptyState,
  SkeletonCard,
  ErrorState,
  PickupTimeline,
  QuickAction,
} from "@/components/ui";

// ── Derived types from api.ts ─────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface EnvImpact {
  diversion_rate_percent: number;
  estimated_co2e_avoided_kg: number;
  is_estimate: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a greeting word appropriate for the current hour. */
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Statuses that represent an in-progress (non-terminal) pickup */
const ACTIVE_STATUSES = new Set([
  "REQUESTED",
  "ASSIGNED",
  "EN_ROUTE",
  "ARRIVED",
]);

/**
 * Derives a single sentence describing the user's current waste-collection
 * situation from their pickup list. No invented data.
 */
function statusSentence(pickups: PickupOut[]): string {
  const active = pickups.find((p) => ACTIVE_STATUSES.has(p.status));
  if (active) {
    const statusWord: Record<string, string> = {
      REQUESTED: "waiting to be assigned to a collector",
      ASSIGNED: "assigned to a collector",
      EN_ROUTE: "on its way — your collector is en route",
      ARRIVED: "your collector has arrived",
    };
    return `Your ${active.waste_category.toLowerCase()} pickup is ${statusWord[active.status] ?? active.status.toLowerCase()}.`;
  }
  const completed = pickups.filter((p) => p.status === "COLLECTED").length;
  if (completed > 0) {
    return `You have ${completed} completed pickup${completed === 1 ? "" : "s"}. Request another whenever you're ready.`;
  }
  return "You have no active pickups. Request one whenever you need collection.";
}

/** Friendly category display: "PLASTIC" → "Plastic" */
function fmtCategory(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

/** Formats an ISO date string for display */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formats a date+time */
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── SVG icon path constants (Heroicons outline 24×24) ─────────────────────────
const ICONS = {
  truck:    "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  bell:     "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  leaf:     "M12 3v1.5M12 3C10.343 3 9 4.343 9 6c0 3.866 3 7 3 7s3-3.134 3-7c0-1.657-1.343-3-3-3zM3 12h1.5M3 12c0 1.657 1.343 3 3 3 3.866 0 7-3 7-3s-3.134-3-7-3C4.343 9 3 10.343 3 12z",
  plus:     "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

function roleRedirectForDashboard(role: string | undefined | null): string | null {
  switch (role) {
    case "COLLECTOR":
      return "/collector";
    case "SUPER_ADMIN":
    case "MUNICIPAL_ADMIN":
      return "/admin";
    case "COMPANY_ADMIN":
      return "/company";
    case "ORGANIZATION_ADMIN":
      return "/organization";
    case "RECYCLER":
      return "/recycler";
    case "CITIZEN":
      return null;
    default:
      return null;
  }
}

export default function DashboardPage() {
  const { token, user, loading } = useAuth();
  const router = useRouter();

  // Data state — independent fail states so one section can fail without
  // breaking the others.
  const [pickups,       setPickups]       = useState<PickupOut[]>([]);
  const [totalPickups,  setTotalPickups]  = useState<number | null>(null);
  const [points,        setPoints]        = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [envImpact,     setEnvImpact]     = useState<EnvImpact | null>(null);

  // Loading / error per-section
  const [coreLoading,  setCoreLoading]  = useState(true);  // pickups + points
  const [notifLoading, setNotifLoading] = useState(true);
  const [envLoading,   setEnvLoading]   = useState(true);
  const [coreError,    setCoreError]    = useState<string | null>(null);

  // Cancelling a pickup
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // ── Combined auth + role redirects (single effect) ───────────────────────
  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    const target = roleRedirectForDashboard(user?.role);
    if (target) {
      router.replace(target);
    }
  }, [loading, token, user, router]);

  // ── Core data fetch (pickups + points) ───────────────────────────────────
  const loadCore = useCallback(() => {
    if (!token) return;
    setCoreLoading(true);
    setCoreError(null);
    Promise.all([
      api.myPickups(token),
      api.pointsBalance(token).catch(() => ({ points_balance: null as number | null })),
    ])
      .then(([pickupsRes, pointsRes]) => {
        setPickups(pickupsRes.items);
        setTotalPickups(typeof pickupsRes.total === "number" ? pickupsRes.total : pickupsRes.items.length);
        setPoints(pointsRes.points_balance);
      })
      .catch(() => setCoreError("Could not load your pickup data. Please try again."))
      .finally(() => setCoreLoading(false));
  }, [token]);

  // ── Notifications fetch (independent) ────────────────────────────────────
  const loadNotifications = useCallback(() => {
    if (!token) return;
    setNotifLoading(true);
    api
      .notifications(token)
      .then((res) => setNotifications(res.items.slice(0, 5))) // cap at 5
      .catch(() => setNotifications([]))                       // fail silently
      .finally(() => setNotifLoading(false));
  }, [token]);

  // ── Environmental impact fetch (independent, nice-to-have) ───────────────
  useEffect(() => {
    if (!token) return;
    const toId = setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- defer until main paint
      setEnvLoading(true);
      api
        .environmentalImpact(token)
        .then((res) =>
          setEnvImpact({
            diversion_rate_percent:    res.diversion_rate_percent,
            estimated_co2e_avoided_kg: res.estimated_co2e_avoided_kg,
            is_estimate:               res.is_estimate,
          })
        )
        .catch(() => setEnvImpact(null))
        .finally(() => setEnvLoading(false));
    }, 80);
    return () => clearTimeout(toId);
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    loadCore();
  }, [loadCore]);
  useEffect(() => {
    const toId = setTimeout(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- defer notification load until after first paint
      loadNotifications();
    }, 40);
    return () => clearTimeout(toId);
  }, [loadNotifications]);

  // ── Cancel a pickup ───────────────────────────────────────────────────────
  async function cancelPickup(pickupId: string) {
    if (!token) return;
    setCancelling(pickupId);
    setCancelError(null);
    try {
      await api.cancelPickup(token, pickupId);
      loadCore(); // refresh the list after cancellation
    } catch {
      setCancelError("Could not cancel this pickup. Please try again.");
    } finally {
      setCancelling(null);
    }
  }

  // ── Auth / role-redirect guard (layout handles the main redirect; safety net) ──
  if (loading || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-stone-500">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
          <p className="text-sm">Loading dashboard…</p>
        </div>
      </main>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const activePickup = pickups.find((p) => ACTIVE_STATUSES.has(p.status));
  const activeCount  = pickups.filter((p) => ACTIVE_STATUSES.has(p.status)).length;
  const completedCount = pickups.filter((p) => p.status === "COLLECTED").length;
  const totalCount     = totalPickups ?? pickups.length;
  const recentPickups  = pickups.slice(0, 5);
  const unreadNotifs   = notifications.filter((n) => !n.is_read);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-stone-50">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-eco-900 to-eco-700 px-4 pb-8 pt-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          {/* Greeting */}
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            {timeGreeting()}, {user?.full_name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="mt-1 text-sm text-eco-200">
            {coreLoading ? "Loading your pickups…" : statusSentence(pickups)}
          </p>

          {/* Primary CTA — prominent inverted (white on dark green) action.
              The Button component does not ship a "white-bg" variant; this
              hero-specific styling is intentional. Accessible name is the
              link text, and it has explicit focus-visible ring. */}
          <a
            href="/pickups/new"
            className="
              mt-5 flex w-full items-center justify-center gap-2 rounded-xl
              bg-white px-5 py-3.5 text-sm font-bold text-eco-900
              shadow-md hover:bg-eco-50 active:scale-[.98] transition-transform
              focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-white
              sm:w-auto sm:inline-flex
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
              strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.plus} />
            </svg>
            Request a Pickup
          </a>
        </div>
      </section>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">

        {/* Core error (only blocks pickups section) */}
        {coreError && (
          <ErrorState message={coreError} onRetry={loadCore} />
        )}

        {/* ── Active pickup card ──────────────────────────────────────────── */}
        {!coreLoading && !coreError && (
          <>
            {activePickup ? (
              <section aria-labelledby="active-pickup-heading">
                <h2 id="active-pickup-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Current pickup
                </h2>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  {/* Top row: category + status badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900">
                        {fmtCategory(activePickup.waste_category)} collection
                      </p>
                      {activePickup.address_text && (
                        <p className="mt-0.5 truncate text-sm text-stone-500">
                          {activePickup.address_text}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-stone-400">
                        Requested {fmtDate(activePickup.created_at)}
                        {activePickup.preferred_date &&
                          ` · Preferred ${fmtDate(activePickup.preferred_date)}`}
                      </p>
                    </div>
                    <StatusBadge status={activePickup.status} className="shrink-0" />
                  </div>

                  {/* Timeline */}
                  <PickupTimeline
                    status={activePickup.status}
                    className="mt-4"
                  />

                  {/* Cancel — only when still REQUESTED (before a collector is assigned) */}
                  {activePickup.status === "REQUESTED" && (
                    <div className="mt-4 border-t border-stone-100 pt-3">
                      {cancelError && (
                        <p className="mb-2 text-xs text-red-600">{cancelError}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => cancelPickup(activePickup.id)}
                        disabled={cancelling === activePickup.id}
                        className="
                          text-sm font-medium text-stone-500 underline-offset-2
                          hover:text-red-600 hover:underline
                          disabled:opacity-40 disabled:cursor-not-allowed
                          focus-visible:outline focus-visible:outline-2
                          focus-visible:outline-offset-2 focus-visible:outline-red-400
                        "
                      >
                        {cancelling === activePickup.id ? "Cancelling…" : "Cancel this pickup"}
                      </button>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              /* No active pickup — friendly empty state */
              <section aria-labelledby="no-active-heading">
                <h2 id="no-active-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Current pickup
                </h2>
                <EmptyState
                  title="No active pickup"
                  description="You don't have a pickup in progress. Request one whenever you need collection."
                  action={{ label: "Request a Pickup", href: "/pickups/new" }}
                />
              </section>
            )}
          </>
        )}

        {/* ── Active pickup skeleton ────────────────────────────────────── */}
        {coreLoading && (
          <section>
            <div className="mb-2 h-3 w-28 animate-pulse rounded bg-stone-200" aria-hidden="true" />
            <SkeletonCard variant="card" className="h-40" />
          </section>
        )}

        {/* ── Summary stats ──────────────────────────────────────────────── */}
        <section aria-label="Your waste collection summary">
          {coreLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SkeletonCard variant="stat" />
              <SkeletonCard variant="stat" />
              <SkeletonCard variant="stat" className="hidden sm:block" />
              <SkeletonCard variant="stat" className="hidden sm:block" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total"
                value={totalCount}
                supporting="requests"
              />
              <StatCard
                label="Active"
                value={activeCount}
                highlight={activeCount > 0}
                supporting="in progress"
              />
              <StatCard
                label="Completed"
                value={completedCount}
                highlight={completedCount > 0}
                supporting="pickups"
              />
              <StatCard
                label="Reward points"
                value={points}
                highlight={points !== null && points > 0}
              />
            </div>
          )}

          {/* CO₂e stat: separate row below on mobile so 2-col grid stays readable.
               On sm+ it's inline next to the 4 stats above — currently the 4-col
               grid handles it alone, and we show CO₂e only on desktop when data
               is available. */}
          {!coreLoading && (
            <div className="mt-3 hidden sm:block">
              {envLoading ? (
                <SkeletonCard variant="stat" />
              ) : envImpact ? (
                <StatCard
                  label="CO₂e avoided"
                  value={`${envImpact.estimated_co2e_avoided_kg} kg`}
                  highlight
                  supporting={envImpact.is_estimate ? "platform-wide estimate" : "platform-wide"}
                />
              ) : null}
            </div>
          )}
        </section>

        {/* ── Quick actions ───────────────────────────────────────────────── */}
        <section aria-labelledby="quick-actions-heading">
          <h2 id="quick-actions-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <QuickAction
              href="/pickups/new"
              iconPath={ICONS.truck}
              label="Request a Pickup"
              description="Schedule waste collection at your location"
            />
            <QuickAction
              href="/schedules"
              iconPath={ICONS.calendar}
              label="Recurring Schedules"
              description="Set up weekly or monthly collections"
            />
          </div>
        </section>

        {/* ── Notifications snippet ───────────────────────────────────────── */}
        {notifLoading ? (
          <section aria-label="Notifications loading">
            <div className="mb-2 h-3 w-28 animate-pulse rounded bg-stone-200" aria-hidden="true" />
            <SkeletonCard variant="row" />
          </section>
        ) : unreadNotifs.length > 0 ? (
          <section aria-labelledby="notifications-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="notifications-heading" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Notifications
              </h2>
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-eco-900 px-1.5 text-[10px] font-bold text-white">
                {unreadNotifs.length}
              </span>
            </div>
            <div className="space-y-2">
              {unreadNotifs.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3"
                >
                  {/* Unread dot */}
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full bg-eco-700"
                    aria-label="Unread"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900 truncate">{n.title}</p>
                    <p className="mt-0.5 text-xs text-stone-500 line-clamp-2">{n.body}</p>
                    <p className="mt-1 text-xs text-stone-400">{fmtDateTime(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Recent pickup history ───────────────────────────────────────── */}
        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Recent pickups
          </h2>

          {coreLoading && (
            <div className="space-y-2">
              <SkeletonCard variant="row" />
              <SkeletonCard variant="row" />
              <SkeletonCard variant="row" />
            </div>
          )}

          {!coreLoading && !coreError && recentPickups.length === 0 && (
            <EmptyState
              title="No pickups yet"
              description="Your pickup history will appear here once you make your first request."
              action={{ label: "Request your first pickup", href: "/pickups/new" }}
            />
          )}

          {!coreLoading && recentPickups.length > 0 && (
            <div className="space-y-2">
              {recentPickups.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {fmtCategory(p.waste_category)}
                      {p.address_text ? ` · ${p.address_text}` : ""}
                    </p>
                    <p className="text-xs text-stone-400">{fmtDate(p.created_at)}</p>
                  </div>
                  <StatusBadge status={p.status} className="shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Environmental impact footer note ─────────────────────────────── */}
        {!envLoading && envImpact && (
          <section
            aria-labelledby="env-heading"
            className="rounded-xl border border-eco-200 bg-eco-50 px-4 py-4"
          >
            <h2 id="env-heading" className="text-xs font-semibold uppercase tracking-wide text-eco-700">
              Platform impact
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-stone-500">Waste diverted</p>
                <p className="text-lg font-bold text-eco-900">
                  {envImpact.diversion_rate_percent}%
                </p>
              </div>
              <div>
                <p className="text-xs text-stone-500">
                  CO₂e avoided
                  {envImpact.is_estimate && (
                    <span className="ml-1 text-[10px] text-stone-400">(est.)</span>
                  )}
                </p>
                <p className="text-lg font-bold text-eco-900">
                  {envImpact.estimated_co2e_avoided_kg} kg
                </p>
              </div>
            </div>
            {envImpact.is_estimate && (
              <p className="mt-2 text-[10px] text-stone-400">
                CO₂e figures are estimates based on configurable assumptions. Platform-wide, not per-citizen.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
