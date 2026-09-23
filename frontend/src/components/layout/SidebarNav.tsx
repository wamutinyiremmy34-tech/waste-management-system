"use client";

/**
 * SidebarNav — desktop persistent sidebar navigation.
 *
 * Renders EcoTrack branding, role-aware nav items, and a user/logout footer.
 * Shown only on md+ screens (hidden on mobile — BottomNav handles mobile).
 *
 * Active state: uses usePathname() from next/navigation.
 * Accessibility: <nav> with aria-label, aria-current="page" on active link.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getNavItems, getRoleLabel, isNavItemActive } from "./navConfig";
import { NavIcon } from "./NavIcon";

// Logout SVG path (arrow-right-on-rectangle / sign-out)
const LOGOUT_ICON = "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75";
// EcoTrack leaf/eco icon path
const ECO_ICON = "M12 3v1.5M12 3C10.343 3 9 4.343 9 6c0 3.866 3 7 3 7s3-3.134 3-7c0-1.657-1.343-3-3-3zM3 12h1.5M3 12c0 1.657 1.343 3 3 3 3.866 0 7-3 7-3s-3.134-3-7-3C4.343 9 3 10.343 3 12zM12 21v-1.5M12 21c1.657 0 3-1.343 3-3 0-3.866-3-7-3-7s-3 3.134-3 7c0 1.657 1.343 3 3 3zM21 12h-1.5M21 12c0-1.657-1.343-3-3-3-3.866 0-7 3-7 3s3.134 3 7 3c1.657 0 3-1.343 3-3z";

export function SidebarNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const navItems = getNavItems(user?.role);

  return (
    <aside className="hidden md:flex md:flex-col md:w-56 lg:w-64 md:shrink-0 bg-eco-900 text-white min-h-screen">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-eco-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
            className="h-5 w-5 text-eco-200"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={ECO_ICON} />
          </svg>
        </div>
        <span className="text-base font-bold tracking-tight text-white">
          EcoTrack
        </span>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`
                flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium
                transition-colors focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-2 focus-visible:outline-eco-200
                ${active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
                }
              `.trim().replace(/\s+/g, " ")}
            >
              <NavIcon path={item.iconPath} className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-eco-200" aria-hidden="true" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="mb-2 px-3 py-2">
          <p className="text-sm font-medium text-white truncate">
            {user?.full_name ?? "—"}
          </p>
          <p className="text-xs text-white/50 truncate">
            {getRoleLabel(user?.role)}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eco-200"
        >
          <NavIcon path={LOGOUT_ICON} className="h-5 w-5 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

export default SidebarNav;
