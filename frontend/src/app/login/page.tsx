"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";

function roleRedirectTarget(role: string): string {
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
    default:
      return "/dashboard";
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const target = roleRedirectTarget(user.role);
      router.replace(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-stone-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1b4332]">Sign in to EcoTrack</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#1b4332] px-4 py-2 font-semibold text-white hover:bg-[#2d6a4f] disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-stone-500">
          No account?{" "}
          <Link href="/register" className="font-medium text-[#2d6a4f]">
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
