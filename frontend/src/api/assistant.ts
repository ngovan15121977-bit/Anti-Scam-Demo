import axiosInstance from "./axios";

export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantChatResponse = {
  answer: string;
  out_of_scope: boolean;
};

export const assistantApi = {
  chat: async (data: { message: string; history: AssistantChatTurn[] }): Promise<AssistantChatResponse> => {
    const response = await axiosInstance.post<AssistantChatResponse>("/v1/assistant/chat", data);
    return response.data;
  },
};
