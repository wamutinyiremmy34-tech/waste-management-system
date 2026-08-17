"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone_number: "",
    role: "CITIZEN" as "CITIZEN" | "COLLECTOR",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.register(form);
      setSuccess(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-stone-50 px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-[#1b4332]">Create your EcoTrack account</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Full name</label>
            <input
              required
              minLength={2}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Phone (optional)</label>
            <input
              placeholder="+2567XXXXXXXX"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            />
            <p className="mt-1 text-xs text-stone-400">At least 8 characters, with a letter and a number.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">I am a...</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "CITIZEN" | "COLLECTOR" })}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-[#2d6a4f] focus:outline-none"
            >
              <option value="CITIZEN">Citizen</option>
              <option value="COLLECTOR">Waste collector</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-emerald-600">Account created! Redirecting to sign in...</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#1b4332] px-4 py-2 font-semibold text-white hover:bg-[#2d6a4f] disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-stone-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#2d6a4f]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
