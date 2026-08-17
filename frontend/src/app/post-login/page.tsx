"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Role-based redirect after login. A CITIZEN goes to the general dashboard;
 * COLLECTOR/SUPER_ADMIN/MUNICIPAL_ADMIN/COMPANY_ADMIN/ORGANIZATION_ADMIN/
 * RECYCLER each go to their own dedicated screen. Every role now has a home
 * to land on.
 */
export default function PostLoginRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "COLLECTOR") {
      router.replace("/collector");
    } else if (user.role === "SUPER_ADMIN" || user.role === "MUNICIPAL_ADMIN") {
      router.replace("/admin");
    } else if (user.role === "COMPANY_ADMIN") {
      router.replace("/company");
    } else if (user.role === "ORGANIZATION_ADMIN") {
      router.replace("/organization");
    } else if (user.role === "RECYCLER") {
      router.replace("/recycler");
    } else {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  return <main className="flex-1 p-8 text-stone-500">Signing you in...</main>;
}
