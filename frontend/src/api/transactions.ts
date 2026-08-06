import axiosInstance from "./axios";

export type TransactionType = "transfer" | "deposit" | "withdraw" | "payment" | "refund";
export type TransactionStatus = "pending" | "completed" | "failed" | "cancelled" | "flagged";

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  fee?: number;
  currency: string;
  fromUserId: string;
  fromUserName?: string;
  toUserId?: string;
  toUserName?: string;
  toAccount?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  riskScore?: number;
  riskReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferRequest {
  toAccount: string;
  amount: number;
  description?: string;
  pin: string;
}

export interface TransferResponse {
  success: boolean;
  message: string;
  data: {
    transaction: Transaction;
    newBalance: number;
  };
}

export interface TransactionHistoryParams {
  page?: number;
  limit?: number;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface TransactionHistoryResponse {
  success: boolean;
  data: {
    transactions: Transaction[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface BalanceResponse {
  success: boolean;
  data: {
    balance: number;
    currency: string;
    heldBalance: number;
  };
}

export interface AnalyzeRequest {
  recipient_account: string;
  recipient_bank: string;
  amount: number;
  recipient_name?: string;
  description?: string;
}

export interface AnalyzeResponse {
  id: string;
  risk_analysis: {
    final_risk_score: number;
    risk_level: string;
    warning_reason: string;
    matched_blacklist: Array<{
      entity: string;
      bank: string;
      risk: number;
    }>;
  };
}

export const transactionsApi = {
  // ✅ Phân tích rủi ro trước khi chuyển tiền
  analyze: async (data: AnalyzeRequest): Promise<AnalyzeResponse> => {
    const res = await axiosInstance.post<AnalyzeResponse>("/v1/transactions/analyze", data);
    return res.data;
  },

  // ✅ Người dùng quyết định sau khi xem cảnh báo
  decide: async (txId: string, decision: "confirmed" | "cancelled") => {
    const res = await axiosInstance.post(`/v1/transactions/${txId}/decide`, { decision });
    return res.data;
  },

  transfer: async (data: TransferRequest): Promise<TransferResponse> => {
    const res = await axiosInstance.post<TransferResponse>("/v1/transactions/transfer", data);
    return res.data;
  },

  getBalance: async (): Promise<BalanceResponse> => {
    const res = await axiosInstance.get<BalanceResponse>("/v1/transactions/balance");
    return res.data;
  },

  getHistory: async (params?: TransactionHistoryParams): Promise<TransactionHistoryResponse> => {
    const res = await axiosInstance.get<TransactionHistoryResponse>("/v1/transactions/history", {
      params,
    });
    return res.data;
  },

  getDetail: async (id: string): Promise<{ success: boolean; data: Transaction }> => {
    const res = await axiosInstance.get(`/v1/transactions/${id}`);
    return res.data;
  },

  deposit: async (data: { amount: number; method: string; bankCode?: string }) => {
    const res = await axiosInstance.post("/v1/transactions/deposit", data);
    return res.data;
  },

  withdraw: async (data: { amount: number; bankAccount: string; bankCode: string; pin: string }) => {
    const res = await axiosInstance.post("/v1/transactions/withdraw", data);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await axiosInstance.post(`/v1/transactions/${id}/cancel`);
    return res.data;
  },

  verifyRecipient: async (account: string) => {
    const res = await axiosInstance.get(`/v1/transactions/verify-recipient`, {
      params: { account },
    });
    return res.data;
  },
};