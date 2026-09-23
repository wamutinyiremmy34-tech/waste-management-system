"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/layout";
import { LoadingState } from "@/components/ui";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  if (loading) {
    return <LoadingState variant="page" message="Loading…" />;
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-stone-500">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-[#2d6a4f]"></div>
          <p className="text-sm">Redirecting to sign in…</p>
        </div>
      </main>
    );
  }

  return <AppShell>{children}</AppShell>;
}
