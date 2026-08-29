import { useEffect, useState, useCallback } from "react";
import { api, setTokens, setOnUnauthorized, hasSession } from "./client";
import { AuthContext } from "./authContext";
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // If there's no stored session, we're a guest immediately — no need to
  // wait on an effect. Otherwise, "loading" until /auth/me resolves.
  const [status, setStatus] = useState(() => (hasSession() ? "loading" : "guest"));

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
    setStatus("guest");
  }, []);

  useEffect(() => {
    setOnUnauthorized(logout);
  }, [logout]);

  // On first load, if we had stored tokens, validate them via /auth/me.
  useEffect(() => {
    if (!hasSession()) return;
    let cancelled = false;
    api.get("/auth/me")
      .then(u => { if (!cancelled) { setUser(u); setStatus("authed"); } })
      .catch(() => { if (!cancelled) setStatus("guest"); });
    return () => { cancelled = true; };
  }, []);

  const login = async (email, password) => {
    const data = await api.post("/auth/login", { email, password }, { auth: false });
    setTokens(data);
    setUser({ ...data.user, organization: data.organization });
    setStatus("authed");
  };

  const register = async (orgName, email, password) => {
    const data = await api.post(
      "/auth/register",
      { org_name: orgName, email, password },
      { auth: false }
    );
    setTokens(data);
    setUser({ ...data.user, organization: data.organization });
    setStatus("authed");
  };

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
