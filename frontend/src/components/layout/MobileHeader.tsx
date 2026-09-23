"use client";

/**
 * MobileHeader — compact top header shown on mobile/tablet.
 *
 * Contains:
 * - EcoTrack brand mark
 * - Current page title (passed as prop from AppShell)
 * - User avatar initial for quick account access (taps to cycle — future phase)
 *
 * Shown below md breakpoint. SidebarNav handles md+.
 * Height: h-14 (56px) — leaves room for content and bottom nav.
 */

import { useAuth } from "@/context/AuthContext";
import { getRoleLabel } from "./navConfig";

// EcoTrack leaf icon (same as sidebar, inline for independence)
const ECO_ICON = "M12 3v1.5M12 3C10.343 3 9 4.343 9 6c0 3.866 3 7 3 7s3-3.134 3-7c0-1.657-1.343-3-3-3zM3 12h1.5M3 12c0 1.657 1.343 3 3 3 3.866 0 7-3 7-3s-3.134-3-7-3C4.343 9 3 10.343 3 12zM12 21v-1.5M12 21c1.657 0 3-1.343 3-3 0-3.866-3-7-3-7s-3 3.134-3 7c0 1.657 1.343 3 3 3zM21 12h-1.5M21 12c0-1.657-1.343-3-3-3-3.866 0-7 3-7 3s3.134 3 7 3c1.657 0 3-1.343 3-3z";

export function MobileHeader() {
  const { user } = useAuth();

  // First letter of name for the avatar badge
  const initial = user?.full_name?.charAt(0).toUpperCase() ?? "?";

  return (
    <header
      className="
        md:hidden sticky top-0 z-30
        flex h-14 items-center justify-between
        bg-eco-900 px-4
        border-b border-white/10
      "
    >
      {/* Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-eco-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
            className="h-4 w-4 text-eco-200"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={ECO_ICON} />
          </svg>
        </div>
        <span className="text-sm font-bold tracking-tight text-white">
          EcoTrack
        </span>
      </div>

      {/* Role + avatar */}
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden xs:block text-xs text-white/60">
            {getRoleLabel(user.role)}
          </span>
        )}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-eco-700 text-sm font-semibold text-white ring-2 ring-eco-500/40"
          aria-label={`Signed in as ${user?.full_name ?? "unknown"}`}
          title={user?.full_name}
        >
          {initial}
        </div>
      </div>
    </header>
  );
}

export default MobileHeader;
