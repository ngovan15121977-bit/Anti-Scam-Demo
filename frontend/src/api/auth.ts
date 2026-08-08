import axiosInstance from "./axios";

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  full_name: string;
  role: "user" | "admin";
  is_active: boolean;
  balance: number;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/login", data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/register", data);
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await axiosInstance.get<User>("/v1/auth/me");
    return response.data;
  },

  logout: async () => {
    localStorage.removeItem("token");
  },
};
