import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      setAuth: (token, user) => {
        localStorage.setItem("access_token", token);
        set({ token, user, isAuthenticated: true, isAdmin: user.role === "admin" });
      },
      logout: () => {
        localStorage.removeItem("access_token");
        set({ user: null, token: null, isAuthenticated: false, isAdmin: false });
      },
    }),
    { name: "auth-storage", partialize: (s) => ({ user: s.user, token: s.token, isAuthenticated: s.isAuthenticated, isAdmin: s.isAdmin }) }
  )
);