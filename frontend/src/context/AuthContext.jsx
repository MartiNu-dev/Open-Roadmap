import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = localStorage.getItem("rm_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      console.error("auth/me failed:", err);
      localStorage.removeItem("rm_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("rm_token", data.access_token);
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      console.error("login failed:", err);
      return { ok: false, error: formatApiError(err) };
    }
  }, []);

  const register = useCallback(async (email, name, password) => {
    try {
      const { data } = await api.post("/auth/register", { email, name, password });
      localStorage.setItem("rm_token", data.access_token);
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      console.error("register failed:", err);
      return { ok: false, error: formatApiError(err) };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); }
    catch (err) { console.error("logout request failed (ignored):", err); }
    localStorage.removeItem("rm_token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshMe }),
    [user, loading, login, register, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
