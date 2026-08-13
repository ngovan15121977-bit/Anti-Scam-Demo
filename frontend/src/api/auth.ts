import axiosInstance from "./axios";

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
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

export interface AccountOverview {
  balance: number;
  transactions_today: number;
  transactions_this_month: number;
  security_score: number;
  security_grade: string;
  transaction_pin_configured: boolean;
  phone_configured: boolean;
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

  overview: async (): Promise<AccountOverview> => {
    const response = await axiosInstance.get<AccountOverview>("/v1/auth/overview");
    return response.data;
  },

  uploadAvatar: async (avatar: File): Promise<User> => {
    const formData = new FormData();
    formData.append("avatar", avatar);
    const response = await axiosInstance.put<User>("/v1/auth/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  setTransactionPin: async (pin: string): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.put<{ configured: boolean }>("/v1/auth/transaction-pin", { pin });
    return response.data;
  },

  transactionPinStatus: async (): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.get<{ configured: boolean }>("/v1/auth/transaction-pin/status");
    return response.data;
  },

  logout: async () => {
    localStorage.removeItem("token");
  },
};
