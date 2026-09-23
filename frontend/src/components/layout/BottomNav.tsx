"use client";

/**
 * BottomNav — mobile bottom navigation bar.
 *
 * Shown on mobile only (md:hidden). Displays the role's most important
 * destinations (max 4) as touch-friendly 44px tap targets.
 *
 * Accessibility:
 * - <nav> with aria-label="Bottom navigation"
 * - aria-current="page" on active item
 * - Labels visible below icons (no icon-only controls)
 * - Focus rings inherited from globals.css :focus-visible
 *
 * Safe area: pb-safe via padding-bottom ensures content is not obscured by
 * iOS home indicator. Falls back gracefully on Android.
 *
 * Roles with only 1 nav item (COLLECTOR, COMPANY_ADMIN, RECYCLER, admin roles)
 * still render the bar so sign-out is accessible without the desktop sidebar.
 * For these roles we also include a "Sign out" item in the bottom nav.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getNavItems, isNavItemActive } from "./navConfig";
import { NavIcon } from "./NavIcon";

// Sign out icon
const LOGOUT_ICON = "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75";

export function BottomNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = getNavItems(user?.role);

  // Cap at 3 nav items + sign-out = 4 total. If role has 3+ items we drop sign-out
  // from bottom nav (it lives in the sidebar on desktop; mobile users with many
  // items get it via the account avatar tap — future phase). With ≤2 items we
  // add sign-out as the last tab.
  const showSignOut = navItems.length <= 2;
  const visibleItems = navItems.slice(0, showSignOut ? 3 : 4);

  return (
    <nav
      aria-label="Bottom navigation"
      className="
        md:hidden fixed bottom-0 left-0 right-0 z-30
        flex items-stretch
        bg-white border-t border-stone-200
        safe-area-inset-bottom
      "
    >
      {visibleItems.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`
              flex flex-1 flex-col items-center justify-center gap-0.5
              min-h-[56px] px-1 py-2 text-xs font-medium
              transition-colors
              focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-[-2px]
              focus-visible:outline-eco-700
              ${active
                ? "text-eco-900"
                : "text-stone-400 hover:text-stone-700"
              }
            `.trim().replace(/\s+/g, " ")}
          >
            <NavIcon
              path={item.iconPath}
              className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`}
            />
            <span className="truncate max-w-[64px]">{item.label}</span>
            {active && (
              <span
                className="absolute bottom-0 h-0.5 w-8 rounded-full bg-eco-700"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}

      {showSignOut && (
        <button
          type="button"
          onClick={logout}
          className="
            flex flex-1 flex-col items-center justify-center gap-0.5
            min-h-[56px] px-1 py-2 text-xs font-medium
            text-stone-400 hover:text-stone-700 transition-colors
            focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-[-2px] focus-visible:outline-eco-700
          "
        >
          <NavIcon path={LOGOUT_ICON} className="h-5 w-5" />
          <span>Sign out</span>
        </button>
      )}
    </nav>
  );
}

export default BottomNav;
