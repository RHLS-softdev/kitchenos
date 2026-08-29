import { createContext, useContext } from "react";

// Shape: { user, status, login, register, logout }
// status: "loading" | "guest" | "authed"
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
