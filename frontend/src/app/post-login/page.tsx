"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Role-based redirect after login. A CITIZEN goes to the general dashboard;
 * COLLECTOR/SUPER_ADMIN/MUNICIPAL_ADMIN/COMPANY_ADMIN/ORGANIZATION_ADMIN/
 * RECYCLER each go to their own dedicated screen. Every role now has a home
 * to land on.
 *
 * Robustness: on direct navigation, give the AuthProvider mount-time check a
 * small grace window before deciding the user is "unauthenticated" and
 * booting them back to /login.
 */
export default function PostLoginRedirect() {
  const { user, loading, token } = useAuth();
  const router = useRouter();
  const [bootGraceMs, setBootGraceMs] = useState(true);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    graceTimer.current = setTimeout(() => setBootGraceMs(false), 2000);
    return () => {
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user) {
      switch (user.role) {
        case "COLLECTOR":
          router.replace("/collector");
          break;
        case "SUPER_ADMIN":
        case "MUNICIPAL_ADMIN":
          router.replace("/admin");
          break;
        case "COMPANY_ADMIN":
          router.replace("/company");
          break;
        case "ORGANIZATION_ADMIN":
          router.replace("/organization");
          break;
        case "RECYCLER":
          router.replace("/recycler");
          break;
        case "CITIZEN":
        default:
          router.replace("/dashboard");
      }
      return;
    }
    if (!bootGraceMs && !token) {
      router.replace("/login");
    }
  }, [loading, user, token, bootGraceMs, router]);

  return (
    <main className="flex flex-1 items-center justify-center p-8 text-stone-500">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
        <p className="text-sm">Signing you in...</p>
      </div>
    </main>
  );
}
