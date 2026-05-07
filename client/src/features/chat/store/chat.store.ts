import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Chat } from "@/features/chat/types/chat.types";

type ChatStoreState = {
  chats: Chat[];
  currentChatId: string | null;
  isNewChat: boolean;

  setChats: (chats: Chat[]) => void;
  setCurrentChat: (id: string | null) => void;
  setIsNewChat: (isNew: boolean) => void;
  upsertChat: (chat: Chat) => void;
  removeChat: (id: string) => void;
  updateChatTitle: (id: string, title: string) => void;
};

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set) => ({
      chats: [],
      currentChatId: null,
      isNewChat: false,

      setChats: (chats) => set({ chats }),

      setCurrentChat: (id) =>
        set((state) => ({
          currentChatId: id,
          isNewChat: id ? false : state.isNewChat,
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
        })),

      updateChatTitle: (id, title) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat._id === id ? { ...chat, title } : chat,
          ),
        })),
    }),
    {
      name: "chat-entity-store",
      partialize: (state) => ({
        chats: state.chats,
        currentChatId: state.currentChatId,
      }),
    },
  ),
);
