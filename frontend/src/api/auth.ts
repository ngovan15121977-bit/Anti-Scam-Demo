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
  timi_bank_enabled: boolean;
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
  security_checks: SecurityCheck[];
}

export interface SecurityCheck {
  label: string;
  detail: string;
  score: number;
  completed: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

export interface FaceVerificationResponse {
  matched: boolean;
  similarity: number;
  threshold: number;
  message: string;
  verification_token?: string | null;
}

export interface FaceLoginRequest extends LoginRequest { pin: string; image_data: string; }
export interface FaceLoginResponse extends TokenResponse { similarity: number; threshold: number; }

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

  loginWithFace: async (data: FaceLoginRequest): Promise<FaceLoginResponse> => {
    const response = await axiosInstance.post<FaceLoginResponse>("/v1/auth/login/face", data);
    return response.data;
  },

  verifyFace: async (imageData: string, transactionId?: string): Promise<FaceVerificationResponse> => {
    const response = await axiosInstance.post<FaceVerificationResponse>("/v1/auth/face/verify", {
      image_data: imageData,
      transaction_id: transactionId,
    }, { timeout: 120_000 });
    return response.data;
  },

  enrollFace: async (imageData: string): Promise<FaceVerificationResponse> => {
    const response = await axiosInstance.put<FaceVerificationResponse>("/v1/auth/face/enrollment", {
      image_data: imageData,
      consent: true,
    }, { timeout: 120_000 });
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

  faceEnrollmentStatus: async (): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.get<{ configured: boolean }>("/v1/auth/face/enrollment/status");
    return response.data;
  },

  logout: async () => {
    localStorage.removeItem("token");
  },
};
