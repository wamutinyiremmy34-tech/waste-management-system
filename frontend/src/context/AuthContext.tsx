"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, UserOut } from "@/lib/api";

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
