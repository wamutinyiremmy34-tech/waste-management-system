"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { api, API_BASE, UserOut } from "@/lib/api";

const AUTH_TIMEOUT_MS = 15000;

async function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    clearTimeout(timeoutId!);
  }
}

interface AuthContextValue {
  token: string | null;
  user: UserOut | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserOut>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("ecotrack_token") : null;
    if (!stored) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    withTimeout(api.me(stored), AUTH_TIMEOUT_MS, "Auth check timed out")
      .then((me) => {
        if (cancelled || !mountedRef.current) return;
        setToken(stored);
        setUser(me);
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        try {
          localStorage.removeItem("ecotrack_token");
          localStorage.removeItem("ecotrack_refresh_token");
        } catch {
          // ignore
        }
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<UserOut> => {
    const tokens = await withTimeout(
      api.login(email, password),
      AUTH_TIMEOUT_MS,
      "Login request timed out. Please try again."
    );
    if (!mountedRef.current) throw new Error("Component unmounted during login");
    localStorage.setItem("ecotrack_token", tokens.access_token);
    localStorage.setItem("ecotrack_refresh_token", tokens.refresh_token);
    setToken(tokens.access_token);

    const me = await withTimeout(
      api.me(tokens.access_token),
      AUTH_TIMEOUT_MS,
      "User profile load timed out. Please try again."
    );
    if (!mountedRef.current) return me;
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    const storedRefresh = typeof window !== "undefined" ? localStorage.getItem("ecotrack_refresh_token") : null;
    const currentToken = token;
    if (storedRefresh && currentToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: storedRefresh }),
      }).catch(() => {
        // Intentionally ignored — local logout proceeds regardless.
      });
    }
    try {
      localStorage.removeItem("ecotrack_token");
      localStorage.removeItem("ecotrack_refresh_token");
    } catch {
      // ignore
    }
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
