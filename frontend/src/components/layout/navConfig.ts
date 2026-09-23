/**
 * EcoTrack Navigation Configuration
 *
 * Single source of truth for role-aware navigation.
 * Each role gets only the links relevant to their work.
 *
 * Routes are derived from the actual app/ directory structure:
 *   /dashboard       — CITIZEN, ORGANIZATION_ADMIN
 *   /pickups/new     — CITIZEN, ORGANIZATION_ADMIN
 *   /schedules       — CITIZEN, ORGANIZATION_ADMIN
 *   /collector       — COLLECTOR
 *   /admin           — SUPER_ADMIN, MUNICIPAL_ADMIN
 *   /company         — COMPANY_ADMIN
 *   /organization    — ORGANIZATION_ADMIN
 *   /recycler        — RECYCLER
 *
 * Icon paths are inline SVG viewBox="0 0 24 24" path data.
 * Keeping icons self-contained avoids an external icon library dependency.
 */

export type UserRole =
  | "CITIZEN"
  | "COLLECTOR"
  | "COMPANY_ADMIN"
  | "ORGANIZATION_ADMIN"
  | "RECYCLER"
  | "MUNICIPAL_ADMIN"
  | "SUPER_ADMIN";

export interface NavItem {
  label: string;
  href: string;
  /** SVG path `d` attribute for a 24×24 icon */
  iconPath: string;
  /** If true, only exact match activates this item (default: prefix match) */
  exact?: boolean;
}

// ── Icon path constants (Heroicons outline style, 24×24 stroke) ──────────────
// Using stroke-based paths so they work with currentColor at any size.

const ICONS = {
  home: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  truck: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  clipboardList: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  map: "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z",
  chartBar: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  building: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
  recycling: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  plusCircle: "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  shieldCheck: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  chatBubbleAlert: "M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.194 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337zM12 7.5v3m0 3h.008v.008H12V10.5z",
} as const;

// ── Nav items per role ────────────────────────────────────────────────────────

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  CITIZEN: [
    { label: "Dashboard", href: "/dashboard", iconPath: ICONS.home, exact: true },
    { label: "Request Pickup", href: "/pickups/new", iconPath: ICONS.plusCircle },
    { label: "Schedules", href: "/schedules", iconPath: ICONS.calendar },
    { label: "Complaints", href: "/complaints", iconPath: ICONS.chatBubbleAlert, exact: true },
  ],

  COLLECTOR: [
    { label: "My Pickups", href: "/collector", iconPath: ICONS.truck, exact: true },
  ],

  COMPANY_ADMIN: [
    { label: "Operations", href: "/company", iconPath: ICONS.building, exact: true },
  ],

  ORGANIZATION_ADMIN: [
    { label: "Dashboard", href: "/dashboard", iconPath: ICONS.home, exact: true },
    { label: "Organization", href: "/organization", iconPath: ICONS.building },
    { label: "Request Pickup", href: "/pickups/new", iconPath: ICONS.plusCircle },
    { label: "Schedules", href: "/schedules", iconPath: ICONS.calendar },
  ],

  RECYCLER: [
    { label: "Recycling", href: "/recycler", iconPath: ICONS.recycling, exact: true },
  ],

  MUNICIPAL_ADMIN: [
    { label: "Command Centre", href: "/admin", iconPath: ICONS.shieldCheck, exact: true },
  ],

  SUPER_ADMIN: [
    { label: "Command Centre", href: "/admin", iconPath: ICONS.shieldCheck, exact: true },
  ],
};

/**
 * Returns nav items for a given role string.
 * Falls back to an empty array for unknown/null roles.
 */
export function getNavItems(role: string | undefined | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS[role as UserRole] ?? [];
}

/**
 * Human-readable display label for a role string.
 */
export function getRoleLabel(role: string | undefined | null): string {
  const labels: Record<string, string> = {
    CITIZEN: "Citizen",
    COLLECTOR: "Collector",
    COMPANY_ADMIN: "Company Admin",
    ORGANIZATION_ADMIN: "Org Admin",
    RECYCLER: "Recycler",
    MUNICIPAL_ADMIN: "Municipal Admin",
    SUPER_ADMIN: "Super Admin",
  };
  return labels[role ?? ""] ?? (role ?? "");
}

/**
 * Determines whether a nav item is active given the current pathname.
 * Uses prefix matching by default so /pickups/new activates a /pickups item.
 * Set item.exact = true for root-level items like /dashboard.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
