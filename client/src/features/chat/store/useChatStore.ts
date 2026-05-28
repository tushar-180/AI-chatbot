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
  loadingChatIds: Record<string, boolean>;
  streamingChatIds: Record<string, boolean>;
  isNewChat: boolean;
  sidebarOpen: boolean;
  hasMore: boolean;
  page: number;
  viewingArchived: boolean;
  currentChat: Chat | null;
  dbUser: any | null;
  setDbUser: (dbUser: any) => void;

  setSidebarOpen: (open: boolean) => void;
  setChats: (chats: Chat[]) => void;
  appendChats: (chats: Chat[]) => void;
  setHasMore: (hasMore: boolean) => void;
  setPage: (page: number) => void;
  resetPagination: () => void;
  setCurrentChat: (id: string | null, chat?: Chat) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, model?: string) => void;
  setLoading: (loading: boolean, chatId?: string | null) => void;
  setIsStreaming: (isStreaming: boolean, chatId?: string | null) => void;
  setIsNewChat: (isNew: boolean) => void;
  upsertChat: (chat: Chat) => void;
  removeChat: (id: string) => void;
  updateChatTitle: (id: string, title: string) => void;
  updateChatArchive: (id: string, _isArchived: boolean) => void;
  updateChatPin: (id: string, isPinned: boolean) => void;
  setViewingArchived: (viewing: boolean) => void;
  clearMessages: () => void;
  setMessageFeedback: (
    messageId: string,
    feedback: "like" | "dislike" | null,
  ) => void;
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
      loadingChatIds: {},
      streamingChatIds: {},
      isNewChat: false,
      sidebarOpen: false,
      hasMore: true,
      page: 1,
      viewingArchived: false,
      currentChat: null,
      dbUser: null,

      setDbUser: (dbUser) => set({ dbUser }),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setChats: (chats) => set({ chats }),

      appendChats: (newChats) =>
        set((state) => {
          const uniqueNewChats = newChats.filter(
            (newChat) => !state.chats.some((chat) => chat._id === newChat._id),
          );
          return { chats: [...state.chats, ...uniqueNewChats] };
        }),

      setHasMore: (hasMore) => set({ hasMore }),

      setPage: (page) => set({ page }),

      resetPagination: () => set({ page: 1, hasMore: true, chats: [] }),

      setCurrentChat: (id, chat) =>
        set((state) => {
          const foundChat =
            chat || state.chats.find((c) => c._id === id) || null;
          const isSameChat = state.currentChatId === id;

          const nextStreamingChatIds = { ...state.streamingChatIds };
          const nextLoadingChatIds = { ...state.loadingChatIds };
          if (!id) {
            // Clean up the temporary new chat stream keys to guarantee the new chat input starts fresh
            delete nextStreamingChatIds["__new_chat_stream__"];
            delete nextLoadingChatIds["__new_chat_stream__"];
          }

          return {
            currentChatId: id,
            isNewChat: id ? false : state.isNewChat,
            currentChat: foundChat,
            messages: isSameChat ? state.messages : [],
            streamingChatIds: nextStreamingChatIds,
            loadingChatIds: nextLoadingChatIds,
            isStreaming: Object.keys(nextStreamingChatIds).length > 0,
            loading: Object.keys(nextLoadingChatIds).length > 0,
          };
        }),

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
              id: crypto.randomUUID(),
              role: "assistant",
              content,
              model,
            });
          }

          return { messages: newMessages };
        }),

      setLoading: (loading, chatId) =>
        set((state) => {
          const key = chatId === undefined ? state.currentChatId : chatId;
          const targetKey = key ?? "__new_chat_stream__";
          const nextLoadingChatIds = { ...state.loadingChatIds };
          if (loading) {
            nextLoadingChatIds[targetKey] = true;
          } else {
            delete nextLoadingChatIds[targetKey];
          }
          const hasLoading = Object.keys(nextLoadingChatIds).length > 0;
          return {
            loading: hasLoading,
            loadingChatIds: nextLoadingChatIds,
          };
        }),

      setIsStreaming: (isStreaming, chatId) =>
        set((state) => {
          const key = chatId === undefined ? state.currentChatId : chatId;
          const targetKey = key ?? "__new_chat_stream__";
          const nextStreamingChatIds = { ...state.streamingChatIds };
          if (isStreaming) {
            nextStreamingChatIds[targetKey] = true;
          } else {
            delete nextStreamingChatIds[targetKey];
          }
          const hasStreams = Object.keys(nextStreamingChatIds).length > 0;
          return {
            isStreaming: hasStreams,
            streamingChatId: hasStreams ? (key ?? state.currentChatId) : null,
            streamingChatIds: nextStreamingChatIds,
          };
        }),

      setIsNewChat: (isNew) => set({ isNewChat: isNew }),

      upsertChat: (chat) =>
        set((state) => {
          const existingIndex = state.chats.findIndex(
            (item) => item._id === chat._id,
          );

          if (existingIndex === -1) {
            return { chats: [chat, ...state.chats] };
          }

          const existingChat = state.chats[existingIndex];
          const updatedChat = { ...existingChat, ...chat };
          const remainingChats = state.chats.filter(
            (item) => item._id !== chat._id,
          );

          return {
            chats: [updatedChat, ...remainingChats],
            currentChat:
              state.currentChatId === chat._id
                ? updatedChat
                : state.currentChat,
          };
        }),

      removeChat: (id) =>
        set((state) => {
          const isCurrentChat = state.currentChatId === id;

          return {
            chats: state.chats.filter((chat) => chat._id !== id),
            currentChatId: isCurrentChat ? null : state.currentChatId,
            currentChat:
              state.currentChat?._id === id ? null : state.currentChat,
            messages: isCurrentChat ? [] : state.messages,
          };
        }),

      updateChatTitle: (id, title) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat._id === id ? { ...chat, title } : chat,
          ),
        })),

      updateChatArchive: (id, isArchived) =>
        set((state) => {
          const isMatch = state.viewingArchived === isArchived;
          const isPresent = state.chats.some((c) => c._id === id);

          let updatedChats = state.chats;
          if (isPresent && !isMatch) {
            // Remove from list if it no longer matches view
            updatedChats = state.chats.filter((c) => c._id !== id);
          } else if (isPresent && isMatch) {
            // Update in place if it still matches view
            updatedChats = state.chats.map((c) =>
              c._id === id
                ? {
                    ...c,
                    isArchived,
                    isPinned: isArchived ? c.isPinned : false,
                  }
                : c,
            );
          } else if (!isPresent && isMatch) {
            // Add back to list if it now matches view (e.g. unarchived while viewing)
            if (state.currentChat && state.currentChat._id === id) {
              updatedChats = [
                {
                  ...state.currentChat,
                  isArchived,
                  isPinned: isArchived ? state.currentChat.isPinned : false,
                },
                ...state.chats,
              ];
            }
          }

          let updatedCurrentChat = state.currentChat;
          if (state.currentChatId === id) {
            updatedCurrentChat = {
              ...state.currentChat!,
              isArchived,
              isPinned: isArchived ? state.currentChat!.isPinned : false,
            };
          }

          return {
            chats: updatedChats,
            currentChat: updatedCurrentChat,
          };
        }),

      updateChatPin: (id, isPinned) =>
        set((state) => {
          const chatIndex = state.chats.findIndex((c) => c._id === id);
          if (chatIndex === -1) return state;

          const updatedChat = { ...state.chats[chatIndex], isPinned, updatedAt: new Date().toISOString() };
          const remainingChats = state.chats.filter((c) => c._id !== id);

          if (isPinned) {
            return { chats: [updatedChat, ...remainingChats] };
          } else {
            // Find its original place based on updatedAt or just put it after pinned chats
            // For simplicity, we'll just put it at the beginning of non-pinned chats
            const pinnedChats = remainingChats.filter((c) => c.isPinned);
            const nonPinnedChats = remainingChats.filter((c) => !c.isPinned);
            return { chats: [...pinnedChats, updatedChat, ...nonPinnedChats] };
          }
        }),

      setViewingArchived: (viewingArchived) =>
        set((state) => {
          if (state.viewingArchived === viewingArchived) return state;
          return { viewingArchived, page: 1, hasMore: true, chats: [] };
        }),

      clearMessages: () => set({ messages: [] }),

      setMessageFeedback: (messageId, feedback) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, feedback } : m,
          ),
        })),
    }),
    {
      name: "chat-storage",
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([key]) =>
              !["loading", "isStreaming", "streamingChatId", "loadingChatIds", "streamingChatIds"].includes(key),
          ),
        ) as ChatState,
    },
  ),
);
