import { create } from "zustand";
import type { Message } from "@/features/chat/types/chat.types";

type TemporaryChatState = {
  isTemporaryChatActive: boolean;
  messages: Message[];
  loading: boolean;
  isStreaming: boolean;
  requestId: string | null;

  setTemporaryChatActive: (active: boolean) => void;
  setMessages: (
    messages: Message[] | ((current: Message[]) => Message[])
  ) => void;
  addMessage: (message: Message) => void;
  setLoading: (loading: boolean) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setRequestId: (requestId: string | null) => void;
  setMessageFeedback: (
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) => void;
  clearStore: () => void;
};

export const useTemporaryChatStore = create<TemporaryChatState>((set) => ({
  isTemporaryChatActive: false,
  messages: [],
  loading: false,
  isStreaming: false,
  requestId: null,

  setTemporaryChatActive: (active) => set({ isTemporaryChatActive: active }),
  setMessages: (messages) =>
    set((state) => ({
      messages: typeof messages === "function" ? messages(state.messages) : messages,
    })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (loading) => set({ loading }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setRequestId: (requestId) => set({ requestId }),
  setMessageFeedback: (messageId, feedback) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, feedback } : m,
      ),
    })),
  clearStore: () => set({ messages: [], loading: false, isStreaming: false, requestId: null }),
}));
