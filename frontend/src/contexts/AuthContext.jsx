import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./useAuth";

const AUTH_KEYS = ["token", "username", "roles", "municipality", "municipality_id", "resetEmail"];

function decodeTokenExpiry(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readStoredAuth() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const expiresAt = decodeTokenExpiry(token);
  if (expiresAt && expiresAt <= Date.now()) {
    AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    return null;
  }
  return {
    token,
    username: localStorage.getItem("username") || "User",
    roles: localStorage.getItem("roles") || null,
    municipality: localStorage.getItem("municipality") || null,
    municipalityId: localStorage.getItem("municipality_id") || null,
    expiresAt,
  };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStoredAuth);

  const login = useCallback((payload) => {
    localStorage.setItem("token", payload.token);
    if (payload.username) localStorage.setItem("username", payload.username);
    if (payload.roles) localStorage.setItem("roles", payload.roles);
    if (payload.municipality) localStorage.setItem("municipality", payload.municipality);
    if (payload.municipality_id) localStorage.setItem("municipality_id", payload.municipality_id);
    setAuth(readStoredAuth());
  }, []);

  const logout = useCallback(() => {
    AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    setAuth(null);
  }, []);

  useEffect(() => {
    if (!auth?.expiresAt) return undefined;
    const timer = setTimeout(logout, Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [auth, logout]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "token" || event.key === null) setAuth(readStoredAuth());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({
      isLoggedIn: !!auth,
      token: auth?.token ?? null,
      username: auth?.username ?? null,
      roles: auth?.roles ?? null,
      municipality: auth?.municipality ?? null,
      municipalityId: auth?.municipalityId ?? null,
      hasRole: (...allowed) => !!auth && allowed.includes(auth.roles),
      login,
      logout,
    }),
    [auth, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
