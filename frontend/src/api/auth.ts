import axiosInstance from "./axios";

export interface User {
  id: string;
  email: string;
  phone?: string;
  fullName: string;
  name?: string;
  avatar?: string;
  role: "user" | "admin";
  balance: number;
  isVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    access_token: string;
    token_type: string;
    user: User;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  fullName?: string;
  phone?: string;
  avatar?: string;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const res = await axiosInstance.post<AuthResponse>("/v1/auth/login", data);
    return res.data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const res = await axiosInstance.post<AuthResponse>("/v1/auth/register", data);
    return res.data;
  },

  me: async (): Promise<User> => {
    const res = await axiosInstance.get<{ user: User }>("/v1/auth/me");
    return res.data.user;
  },

  changePassword: async (data: ChangePasswordRequest) => {
    const res = await axiosInstance.post("/v1/auth/change-password", data);
    return res.data;
  },

  updateProfile: async (data: UpdateProfileRequest): Promise<User> => {
    const res = await axiosInstance.put<{ user: User }>("/v1/auth/profile", data);
    return res.data.user;
  },

  forgotPassword: async (email: string) => {
    const res = await axiosInstance.post("/v1/auth/forgot-password", { email });
    return res.data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const res = await axiosInstance.post("/v1/auth/reset-password", { token, newPassword });
    return res.data;
  },

  logout: async () => {
    try {
      await axiosInstance.post("/v1/auth/logout");
    } catch {
      // Silent fail
    }
  },
};