"use client";

/**
 * AppShell — authenticated application shell.
 *
 * Provides the persistent layout for all authenticated pages:
 *
 *   Desktop (md+):
 *     ┌─────────────┬──────────────────────────────┐
 *     │  SidebarNav │  main content area            │
 *     │  (eco-900)  │  (scrollable, stone-50 bg)   │
 *     └─────────────┴──────────────────────────────┘
 *
 *   Mobile (<md):
 *     ┌──────────────────────────────┐
 *     │  MobileHeader (sticky top)  │
 *     ├──────────────────────────────┤
 *     │  main content area           │
 *     │  (scrollable)                │
 *     ├──────────────────────────────┤
 *     │  BottomNav (fixed bottom)    │
 *     └──────────────────────────────┘
 *
 * Content width:
 *   Pages receive the full content area width. They control their own
 *   max-width via the `contentClassName` prop or their own inner containers.
 *   This allows:
 *     - Normal pages: constrained readable width (max-w-4xl etc)
 *     - Map/operational pages: full width
 *
 * The shell does NOT impose a max-width on children, preserving the
 * OperationalMap and admin tabs that need the full viewport.
 *
 * Bottom-nav offset:
 *   On mobile, content is padded-bottom by pb-20 to prevent BottomNav
 *   from overlapping the last content item.
 */

import type { ReactNode } from "react";
import { SidebarNav } from "./SidebarNav";
import { MobileHeader } from "./MobileHeader";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps): ReactNode {
  return (
    <div className="flex min-h-screen bg-stone-50">
      {/* Desktop sidebar — hidden on mobile */}
      <SidebarNav />

      {/* Right column: mobile header + scrollable content + mobile bottom nav */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top header */}
        <MobileHeader />

        {/* Main content area
            - flex-1 so it fills the remaining vertical space
            - pb-20 md:pb-0 offsets the fixed BottomNav on mobile
            - overflow-x-hidden prevents horizontal scrolling on narrow screens
        */}
        <main
          id="main-content"
          className="flex-1 overflow-x-hidden pb-20 md:pb-0"
        >
          {children}
        </main>

        {/* Mobile bottom nav — fixed, so it sits outside document flow */}
        <BottomNav />
      </div>
    </div>
  );
}

export default AppShell;
