import { apiClient } from "./client";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "@/types";

export const authApi = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const res = await apiClient.post("/auth/login", data);
    return res.data;
  },
  register: async (data: RegisterRequest): Promise<TokenResponse> => {
    const res = await apiClient.post("/auth/register", data);
    return res.data;
  },
  me: async (): Promise<User> => {
    const res = await apiClient.get("/auth/me");
    return res.data;
  },
};