"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, API_BASE, UserOut } from "@/lib/api";

interface AuthContextValue {
  token: string | null;
  user: UserOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("ecotrack_token") : null;
    if (!stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial auth-check-on-mount has no external-store equivalent here
      setLoading(false);
      return;
    }
    api
      .me(stored)
      .then((me) => {
        setToken(stored);
        setUser(me);
      })
      .catch(() => {
        localStorage.removeItem("ecotrack_token");
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const tokens = await api.login(email, password);
    localStorage.setItem("ecotrack_token", tokens.access_token);
    localStorage.setItem("ecotrack_refresh_token", tokens.refresh_token);
    setToken(tokens.access_token);
    const me = await api.me(tokens.access_token);
    setUser(me);
  }

  function logout() {
    // Revoke the refresh token server-side before clearing local state.
    // This ensures the 14-day refresh token cannot be reused after logout,
    // even if it was exfiltrated (e.g. from localStorage). The API call
    // is fire-and-forget: if it fails (expired token, network error) we
    // still clear local state — the server-side revocation is defense-in-depth,
    // not a gate on completing the logout from the user's perspective.
    const storedRefresh = typeof window !== "undefined" ? localStorage.getItem("ecotrack_refresh_token") : null;
    if (storedRefresh && token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: storedRefresh }),
      }).catch(() => {
        // Intentionally ignored — local logout proceeds regardless.
      });
    }
    localStorage.removeItem("ecotrack_token");
    localStorage.removeItem("ecotrack_refresh_token");
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
