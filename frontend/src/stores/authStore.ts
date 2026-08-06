import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi, User } from "@/api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;

  setAuth: (token: string, user: User) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { fullName: string; email: string; phone?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (partialUser: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,

      setAuth: (token, user) => {
        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === "admin",
        });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, password });
          const { token, user } = res.data;
          set({
            token,
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const res = await authApi.register(data);
          const { token, user } = res.data;
          set({
            token,
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        await authApi.logout();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isAdmin: false,
        });
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const user = await authApi.me();
          set({
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isAdmin: false,
          });
        }
      },

      updateUser: (partialUser) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...partialUser } });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        isAuthenticated: s.isAuthenticated,
        isAdmin: s.isAdmin,
      }),
    }
  )
);