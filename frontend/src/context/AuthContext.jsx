import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { API_BASE, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);
const DEFAULT_AUTH_OPTIONS = {
  local_login_enabled: true,
  self_register_enabled: true,
  oidc: {
    enabled: false,
    display_name: null,
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authOptions, setAuthOptions] = useState(DEFAULT_AUTH_OPTIONS);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      if (err?.response?.status !== 401) {
        console.error("auth/me failed:", err);
      }
      setUser(null);
    }
  }, []);

  const refreshAuthOptions = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/options");
      setAuthOptions({
        ...DEFAULT_AUTH_OPTIONS,
        ...data,
        oidc: {
          ...DEFAULT_AUTH_OPTIONS.oidc,
          ...(data?.oidc || {}),
        },
      });
    } catch (err) {
      console.error("auth/options failed:", err);
      setAuthOptions(DEFAULT_AUTH_OPTIONS);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    Promise.all([refreshMe(), refreshAuthOptions()]).finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [refreshMe, refreshAuthOptions]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
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
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      console.error("register failed:", err);
      return { ok: false, error: formatApiError(err) };
    }
  }, []);

  const startOidcLogin = useCallback((nextPath = "/dashboard") => {
    const safeNext = nextPath?.startsWith("/") ? nextPath : "/dashboard";
    window.location.assign(`${API_BASE}/auth/oidc/start?next=${encodeURIComponent(safeNext)}`);
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    const nextPath = "/";
    window.location.assign(`${API_BASE}/auth/logout/browser?next=${encodeURIComponent(nextPath)}`);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authOptions,
      login,
      register,
      logout,
      refreshMe,
      refreshAuthOptions,
      startOidcLogin,
    }),
    [user, loading, authOptions, login, register, logout, refreshMe, refreshAuthOptions, startOidcLogin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
