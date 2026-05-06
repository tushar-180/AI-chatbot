import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat, Message } from "@/features/chat/types/chat.types";

type ChatState = {
  chats: Chat[];
  currentChatId: string | null;
  messages: Message[];
  loading: boolean;
  isStreaming: boolean;
  streamingChatId: string | null;
  isNewChat: boolean;
  sidebarOpen: boolean;

  setSidebarOpen: (open: boolean) => void;
  setChats: (chats: Chat[]) => void;
  setCurrentChat: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, model?: string) => void;
  setLoading: (loading: boolean) => void;
  setIsStreaming: (isStreaming: boolean, chatId?: string | null) => void;
  setIsNewChat: (isNew: boolean) => void;
  upsertChat: (chat: Chat) => void;
  removeChat: (id: string) => void;
  updateChatTitle: (id: string, title: string) => void;
  upsertChat: (chat: Chat) => void;
  clearMessages: () => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: [],
      currentChatId: null,
      messages: [],
      loading: false,
      isStreaming: false,
      streamingChatId: null,
      isNewChat: false,
      sidebarOpen: false,

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setChats: (chats) => set({ chats }),

      setCurrentChat: (id) =>
        set((state) => ({
          currentChatId: id,
          isNewChat: id ? false : state.isNewChat,
        })),

      setMessages: (messages) => set({ messages }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      updateLastMessage: (content, model) =>
        set((state) => {
          const newMessages = [...state.messages];
          const lastMessage = newMessages[newMessages.length - 1];

          if (lastMessage?.role === "assistant") {
            newMessages[newMessages.length - 1] = {
              ...lastMessage,
              content,
            };
          } else {
            newMessages.push({
              role: "assistant",
              content,
              model,
            });
          }

          return { messages: newMessages };
        }),

      setLoading: (loading) => set({ loading }),

      setIsStreaming: (isStreaming, chatId) =>
        set((state) => ({
          isStreaming,
          streamingChatId: isStreaming
            ? (chatId ?? state.currentChatId)
            : null,
        })),

      setIsNewChat: (isNew) => set({ isNewChat: isNew }),

      upsertChat: (chat) =>
        set((state) => {
          const existingIndex = state.chats.findIndex(
            (item) => item._id === chat._id,
          );

          if (existingIndex === -1) {
            return { chats: [chat, ...state.chats] };
          }

          const chats = [...state.chats];
          chats[existingIndex] = { ...chats[existingIndex], ...chat };
          return { chats };
        }),

      removeChat: (id) =>
        set((state) => ({
          chats: state.chats.filter((chat) => chat._id !== id),
          currentChatId:
            state.currentChatId === id ? null : state.currentChatId,
          messages: state.currentChatId === id ? [] : state.messages,
        })),

      updateChatTitle: (id, title) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat._id === id ? { ...chat, title } : chat
          ),
        })),

      upsertChat: (chat) =>
        set((state) => {
          const existingIndex = state.chats.findIndex(
            (item) => item._id === chat._id,
          );

          if (existingIndex === -1) {
            return { chats: [chat, ...state.chats] };
          }

          const chats = [...state.chats];
          const nextTitle =
            chat.title.trim().length > 0
              ? chat.title
              : chats[existingIndex].title;

          chats[existingIndex] = {
            ...chats[existingIndex],
            ...chat,
            title: nextTitle,
          };

          return { chats };
        }),

      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "chat-storage",
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) =>
              !["loading", "isStreaming", "streamingChatId"].includes(key),
          ),
        ) as ChatState,
    },
  ),
);
